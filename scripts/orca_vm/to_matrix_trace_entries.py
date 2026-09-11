"""Convert the ES-direct trace cache into the shape the matrix renderer reads.

`build_trace_cache.py` emits `execid::suite::model::example` -> [raw ES score docs].
`render_matrix_html.ts` looks up `traceKey(modelId, columnId)` == `modelId:columnId`
and reads `steps` / `question` / `toolTrail` at the TOP level of the entry.

Neither the key shape nor the value shape matches, so passing the raw cache
straight to the renderer produces exit 0, zero warnings, and a board with no
trace cards at all. This converter bridges the two contracts.

usage: to_matrix_trace_entries.py <raw-cache.json> <out-entries.json>
"""

import collections
import json
import sys

# Upstream (query_matrix_traces.ts:95, trajectory_agreement.ts:407) treats the
# last message over 50 chars as the final answer; match it exactly so offline
# and live renders agree.
MIN_ANSWER_CHARS = 50


def out_of(doc):
    return (doc.get('task') or {}).get('output') or {}


def raw_steps(doc):
    s = out_of(doc).get('steps')
    return s if isinstance(s, list) else []


def to_step(s):
    kind = s.get('type')
    if kind == 'tool_call' or s.get('tool_id'):
        args = s.get('args')
        return {
            'type': 'tool',
            'toolId': s.get('tool_id') or s.get('toolId'),
            'toolParams': json.dumps(args)[:600] if args is not None else None,
        }
    if kind == 'skill' or s.get('skills'):
        return {'type': 'skill', 'skills': s.get('skills') or []}
    txt = s.get('text') or s.get('content') or s.get('reasoning')
    return {'type': 'reasoning', 'text': (txt or '')[:2000]}


def to_entry(doc, sibling_docs):
    steps = [to_step(s) for s in raw_steps(doc)]
    steps = [{k: v for k, v in s.items() if v is not None} for s in steps]
    trail = [s['toolId'] for s in steps if s.get('type') == 'tool' and s.get('toolId')]

    example = doc.get('example') or {}
    question = example.get('input')
    if isinstance(question, dict):
        question = question.get('question') or json.dumps(question)[:2000]

    # Both fields come from the sibling docs, not just the richest-steps one:
    # 22 of 759 cells keep their steps and their final message in DIFFERENT
    # documents. The answer lives at `messages[].message` as a plain string --
    # there is no `output.answer` field, so probing for one silently strips
    # every card's conclusion ("No final answer message captured."). Upstream
    # rule: the LAST message over MIN_ANSWER_CHARS wins; shorter trailing
    # messages are tool chatter.
    answer = None
    scores = {}
    for sibling in sibling_docs:
        for msg in out_of(sibling).get('messages') or []:
            text = msg.get('message') if isinstance(msg, dict) else None
            if isinstance(text, str) and len(text.strip()) > MIN_ANSWER_CHARS:
                answer = text
        evaluator = sibling.get('evaluator') or {}
        name, value = evaluator.get('name'), evaluator.get('score')
        if name is not None and isinstance(value, (int, float)):
            scores.setdefault(name, []).append(value)

    entry = {
        'steps': steps,
        'stepCount': len(steps),
        'toolCount': len(trail),
        'toolTrail': trail,
    }
    if question:
        entry['question'] = question if isinstance(question, str) else str(question)
    if isinstance(answer, str) and answer:
        entry['answer'] = answer[:4000]
    if scores:
        entry['scores'] = {k: sum(v) / len(v) for k, v in scores.items()}
        reps = max(len(v) for v in scores.values())
        if reps > 1:
            entry['repetitions'] = reps
            entry['spread'] = {k: max(v) - min(v) for k, v in scores.items() if len(v) > 1}
    return entry


def main():
    if len(sys.argv) < 3:
        sys.exit('usage: to_matrix_trace_entries.py <raw-cache.json> <out-entries.json>')
    src, dst = sys.argv[1], sys.argv[2]

    raw = json.load(open(src))
    grouped = collections.defaultdict(list)
    for key, docs in raw.items():
        parts = key.split('::')
        if len(parts) < 4 or not isinstance(docs, list) or not docs:
            continue
        grouped[(parts[2], parts[3])].extend(docs)

    entries = {}
    for (model, example), docs in grouped.items():
        # Several executions can cover one (model, example); keep the richest
        # trail rather than whichever the scan happened to see first.
        best = max(docs, key=lambda d: len(raw_steps(d)))
        if not raw_steps(best):
            continue
        entries[f'{model}:{example}'] = to_entry(best, docs)

    json.dump(entries, open(dst, 'w'))
    with_steps = sum(1 for e in entries.values() if e.get('steps'))
    with_question = sum(1 for e in entries.values() if e.get('question'))
    with_answer = sum(1 for e in entries.values() if e.get('answer'))
    print(f'grouped pairs : {len(grouped)}')
    print(f'entries       : {len(entries)}')
    print(f'  with steps  : {with_steps}')
    print(f'  with question: {with_question}')
    print(f'  with answer : {with_answer}')
    print(f'  models      : {len({k.split(":", 1)[0] for k in entries})}')
    print(f'wrote         : {dst}')

    # A field that is empty for EVERY entry is a probe reading the wrong key,
    # not a corpus that happens to lack it. Printing the zero and continuing is
    # how boards shipped with "No final answer message captured." on every card.
    for field, count in (('steps', with_steps), ('question', with_question), ('answer', with_answer)):
        if entries and count == 0:
            sys.exit(
                f"error: 0 of {len(entries)} entries carry '{field}'. That is a field-path "
                f"bug in this converter, not missing data -- fix the probe before rendering."
            )


if __name__ == '__main__':
    main()
