---
navigation_title: "Security"
description: "Security best practices for Kibana contributors, organized by class of vulnerability."
---

# Security

When writing code for {{kib}}, follow these best practices to avoid common vulnerabilities. The references to the Open Web Application Security Project (OWASP) explain each class of attack in more depth.

This page is topical reference. For the underlying commitment, see the [Build secure software by default](./developer-principles.md#build-secure-software-by-default) principle.

## Cross-site Scripting (XSS)

[_OWASP reference for XSS_](https://owasp.org/www-community/attacks/xss)

XSS is a class of attacks where malicious scripts are injected into vulnerable websites. {{kib}} defends against this by using the React framework to safely encode data that is rendered in pages, the EUI framework to [automatically sanitize links](https://elastic.github.io/eui/#/navigation/link#link-validation), and a restrictive `Content-Security-Policy` header.

**Best practices**

- Check for dangerous functions or assignments that can result in unescaped user input in the browser DOM. Avoid using:
  - **React:** [`dangerouslySetInnerHtml`](https://reactjs.org/docs/dom-elements.html#dangerouslysetinnerhtml).
  - **Browser DOM:** `Element.innerHTML` and `Element.outerHTML`.
- If using the aforementioned unsafe functions or assignments is absolutely necessary, follow [these XSS prevention rules](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html#xss-prevention-rules) to ensure that user input is not inserted into unsafe locations and that it is escaped properly.
- Use EUI components to build your UI, particularly when rendering `href` links. Otherwise, sanitize user input before rendering links to ensure that they do not use the `javascript:` protocol.
- Don't use the `eval`, `Function`, and `_.template` functions -- these are restricted by ESLint rules.
- Be careful when using `setTimeout` and `setInterval` in client-side code. If an attacker can manipulate the arguments and pass a string to one of these, it is evaluated dynamically, which is equivalent to the dangerous `eval` function.

## Cross-Site Request Forgery (CSRF/XSRF)

[_OWASP reference for CSRF_](https://owasp.org/www-community/attacks/csrf)

CSRF is a class of attacks where a user is forced to execute an action on a vulnerable website that they're logged into, usually without their knowledge. {{kib}} defends against this by requiring [custom request headers](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#use-of-custom-request-headers) for API endpoints. For more information, see [API Request Headers](https://www.elastic.co/guide/en/kibana/master/api.html#api-request-headers).

**Best practices**

- Ensure all HTTP routes are registered with the [Kibana HTTP service](https://www.elastic.co/guide/en/kibana/master/http-service.html) to take advantage of the custom request header security control.
  - Note that HTTP GET requests do **not** require the custom request header; any routes that change data should [adhere to the HTTP specification and use a different method (PUT, POST, etc.)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods)

## Remote Code Execution (RCE)

[_OWASP reference for Command Injection_](https://owasp.org/www-community/attacks/Command_Injection),
[_OWASP reference for Code Injection_](https://owasp.org/www-community/attacks/Code_Injection)

RCE is a class of attacks where an attacker executes malicious code or commands on a vulnerable server. {{kib}} defends against this by using ESLint rules to restrict vulnerable functions, and by hooking into or hardening usage of these in third-party dependencies.

**Best practices**

- Don't use the `eval`, `Function`, and `_.template` functions -- these are restricted by ESLint rules.
- Don't use dynamic `require`.
- Check for usages of templating libraries. Ensure that user-provided input doesn't influence the template and is used only as data for rendering the template.
- Take extra caution when spawning child processes with any user input or parameters that are user-controlled.

## Prototype Pollution

Prototype Pollution is an attack that is unique to JavaScript environments. Attackers can abuse JavaScript's prototype inheritance to "pollute" objects in the application, which is often used as a vector for XSS or RCE vulnerabilities. {{kib}} defends against this by hardening sensitive functions (such as those exposed by `child_process`), and by requiring validation on all HTTP routes by default.

**Best practices**

- Check for instances of `anObject[a][b] = c` where `a`, `b`, and `c` are controlled by user input. This includes code paths where the following logical code steps could be performed in separate files by completely different operations, or by recursively using dynamic operations.
- Validate all user input, including API URL parameters, query parameters, and payloads. Preferably, use a schema that only allows specific keys and values. At a minimum, implement a deny-list that prevents `__proto__` and `prototype.constructor` from being used within object keys.
- When calling APIs that spawn new processes or perform code generation from strings, protect against Prototype Pollution by checking if `Object.hasOwnProperty` has arguments to the APIs that originate from an Object. An example is the defunct Code app's [`spawnProcess`](https://github.com/elastic/kibana/blob/b49192626a8528af5d888545fb14cd1ce66a72e7/x-pack/legacy/plugins/code/server/lsp/workspace_command.ts#L40-L44) function.
  - Common Node.js offenders: `child_process.spawn`, `child_process.exec`, `eval`, `Function('some string')`, `vm.runInContext(x)`, `vm.runInNewContext(x)`, `vm.runInThisContext()`
  - Common client-side offenders: `eval`, `Function('some string')`, `setTimeout('some string', num)`, `setInterval('some string', num)`

See also:

- [Prototype pollution: The dangerous and underrated vulnerability impacting JavaScript applications | portswigger.net](https://portswigger.net/daily-swig/prototype-pollution-the-dangerous-and-underrated-vulnerability-impacting-javascript-applications)
- [Prototype pollution attack in NodeJS application | Olivier Arteau](https://github.com/HoLyVieR/prototype-pollution-nsec18/blob/master/paper/JavaScript_prototype_pollution_attack_in_NodeJS.pdf)

## Server-Side Request Forgery (SSRF)

[_OWASP reference for SSRF_](https://owasp.org/www-community/attacks/Server_Side_Request_Forgery)

SSRF is a class of attacks where a vulnerable server is forced to make an unintended request, usually to an HTTP API. This is often used as a vector for information disclosure or injection attacks.

**Best practices**

- Ensure that all outbound requests from the {{kib}} server use hard-coded URLs.
- If user input is used to construct a URL for an outbound request, ensure that an allow-list is used to validate the endpoints and that user input is escaped properly. Ideally, the allow-list should be set in `kibana.yml`, so only server administrators can change it.
  - This is particularly relevant when using `transport.request` with the Elasticsearch client, as no automatic escaping is performed.
  - Note that URLs are very hard to validate properly; exact match validation for user input is most preferable, while URL parsing or RegEx validation should only be used if absolutely necessary.

## Reverse tabnabbing

[_OWASP reference for Reverse Tabnabbing_](https://owasp.org/www-community/attacks/Reverse_Tabnabbing)

Reverse tabnabbing is an attack where a link to a malicious page is used to rewrite a vulnerable parent page. This is often used as a vector for phishing attacks. {{kib}} defends against this by using the EUI framework, which automatically adds the `rel` attribute to anchor tags, buttons, and other vulnerable DOM elements.

**Best practices**

- Use EUI components to build your UI whenever possible. Otherwise, ensure that any DOM elements that have an `href` attribute also have the `rel="noreferrer noopener"` attribute specified. For more information, refer to the [OWASP HTML5 Security Cheat Sheet](https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/HTML5_Security_Cheat_Sheet.md#tabnabbing).
- If using a non-EUI markdown renderer, use a custom link renderer for rendered links.

## Information disclosure

Information disclosure is not an attack, but it describes whenever sensitive information is accidentally revealed. This can be configuration info, stack traces, or other data that the user is not authorized to access. This concern cannot be addressed with a single security control, but at a high level, {{kib}} relies on the hapi framework to automatically redact stack traces and detailed error messages in HTTP 5xx response payloads.

**Best practices**

- Look for instances where sensitive information might accidentally be revealed, particularly in error messages, in the UI, and URL parameters that are exposed to users.
- Make sure that sensitive request data is not forwarded to external resources. For example, copying client request headers and using them to make an another request could accidentally expose the user's credentials.
