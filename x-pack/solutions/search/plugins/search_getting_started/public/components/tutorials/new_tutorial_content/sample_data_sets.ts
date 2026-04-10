/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const sampleBookCatalogData = `{ "index": {} }
{ "title": "Snow Crash", "author": "Neal Stephenson", "genre": "sci-fi", "publish_year": 1992, "description": "A pizza deliverer in a dystopian future discovers a new drug that affects people in both the virtual and physical worlds." }
{ "index": {} }
{ "title": "Neuromancer", "author": "William Gibson", "genre": "sci-fi", "publish_year": 1984, "description": "A washed-up hacker is hired for one last job involving a powerful artificial intelligence." }
{ "index": {} }
{ "title": "Dune", "author": "Frank Herbert", "genre": "sci-fi", "publish_year": 1965, "description": "A young nobleman navigates politics and ecology on a desert planet that produces the most valuable substance in the universe." }
{ "index": {} }
{ "title": "The Great Gatsby", "author": "F. Scott Fitzgerald", "genre": "fiction", "publish_year": 1925, "description": "A mysterious millionaire's obsession with recapturing a lost love during the Jazz Age." }
{ "index": {} }
{ "title": "To Kill a Mockingbird", "author": "Harper Lee", "genre": "fiction", "publish_year": 1960, "description": "A young girl witnesses her father defend a Black man accused of a crime in the Depression-era South." }
{ "index": {} }
{ "title": "Foundation", "author": "Isaac Asimov", "genre": "sci-fi", "publish_year": 1951, "description": "A mathematician predicts the fall of a galactic empire and establishes a foundation to preserve knowledge." }
{ "index": {} }
{ "title": "The Left Hand of Darkness", "author": "Ursula K. Le Guin", "genre": "sci-fi", "publish_year": 1969, "description": "An envoy visits a planet where inhabitants can change gender, exploring themes of identity and politics." }
{ "index": {} }
{ "title": "Pride and Prejudice", "author": "Jane Austen", "genre": "fiction", "publish_year": 1813, "description": "A witty young woman navigates love and social class in Regency-era England." }
{ "index": {} }
{ "title": "Fahrenheit 451", "author": "Ray Bradbury", "genre": "sci-fi", "publish_year": 1953, "description": "In a future where books are banned, a fireman begins to question his role in destroying literature." }
{ "index": {} }
{ "title": "1984", "author": "George Orwell", "genre": "fiction", "publish_year": 1949, "description": "A man struggles against a totalitarian regime that controls every aspect of life including thought itself." }
{ "index": {} }
{ "title": "Brave New World", "author": "Aldous Huxley", "genre": "sci-fi", "publish_year": 1932, "description": "Citizens of a futuristic World State are engineered into an intelligence-based social hierarchy." }
{ "index": {} }
{ "title": "The Hitchhiker's Guide to the Galaxy", "author": "Douglas Adams", "genre": "sci-fi", "publish_year": 1979, "description": "Moments before Earth's demolition, an ordinary man is whisked across the galaxy by his alien friend." }
`;

export const sampleBasicsData = `{ "index": {} }
{ "name": "Revelation Space", "author": "Alastair Reynolds", "release_date": "2000-03-15", "page_count": 585 }
{ "index": {} }
{ "name": "1984", "author": "George Orwell", "release_date": "1985-06-01", "page_count": 328 }
{ "index": {} }
{ "name": "Fahrenheit 451", "author": "Ray Bradbury", "release_date": "1953-10-15", "page_count": 227 }
{ "index": {} }
{ "name": "Brave New World", "author": "Aldous Huxley", "release_date": "1932-06-01", "page_count": 268 }
{ "index": {} }
{ "name": "The Handmaids Tale", "author": "Margaret Atwood", "release_date": "1985-06-01", "page_count": 311 }
{ "index": {} }
{ "name": "Dune", "author": "Frank Herbert", "release_date": "1965-08-01", "page_count": 412 }
{ "index": {} }
{ "name": "Foundation", "author": "Isaac Asimov", "release_date": "1951-06-01", "page_count": 244 }
{ "index": {} }
{ "name": "Neuromancer", "author": "William Gibson", "release_date": "1984-07-01", "page_count": 271 }
{ "index": {} }
{ "name": "The Left Hand of Darkness", "author": "Ursula K. Le Guin", "release_date": "1969-03-01", "page_count": 286 }
{ "index": {} }
{ "name": "Do Androids Dream of Electric Sheep?", "author": "Philip K. Dick", "release_date": "1968-03-01", "page_count": 210 }
`;

export const sampleSemanticData = `{ "index": {} }
{ "text": "Yellowstone National Park is one of the largest national parks in the United States. It ranges from Wyoming to Montana and Idaho, and contains an area of 2,219,791 acres across three different states. Its most famous for hosting the geyser Old Faithful and is centered on the Yellowstone Caldera, the largest super volcano on the American continent. Yellowstone is host to hundreds of species of animal, many of which are endangered or threatened. Most notably, it contains free-ranging herds of bison and elk, alongside bears, cougars and wolves. The national park receives over 4.5 million visitors annually and is a UNESCO World Heritage Site." }
{ "index": {} }
{ "text": "Yosemite National Park is a United States National Park, covering over 750,000 acres of land in California. A UNESCO World Heritage Site, the park is best known for its granite cliffs, waterfalls and giant sequoia trees. Yosemite hosts over four million visitors in most years, with a peak of five million visitors in 2016. The park is home to a diverse range of wildlife, including mule deer, black bears, and the endangered Sierra Nevada bighorn sheep." }
{ "index": {} }
{ "text": "Rocky Mountain National Park is one of the most popular national parks in the United States. It receives over 4.5 million visitors annually, and is known for its mountainous terrain, including Longs Peak, which is the highest peak in the park. The park is home to a variety of wildlife, including elk, mule deer, moose, and bighorn sheep." }
{ "index": {} }
{ "text": "Grand Canyon National Park is located in Arizona and is known for its immense size and colorful landscape. The canyon is 277 miles long, up to 18 miles wide, and over a mile deep. It was carved by the Colorado River over millions of years. The park receives about 6 million visitors each year and is a UNESCO World Heritage Site." }
{ "index": {} }
{ "text": "Zion National Park is located in southwestern Utah and is known for its towering red cliffs, narrow slot canyons, and diverse plant life. The park covers 229 square miles and receives over 4 million visitors annually. Popular hikes include Angels Landing and The Narrows." }
{ "index": {} }
{ "text": "Great Smoky Mountains National Park straddles the border between North Carolina and Tennessee. It is the most visited national park in the United States, welcoming over 12 million visitors annually. The park is known for its ancient mountains, diverse wildlife, and the synchronous fireflies that light up the forest each summer." }
{ "index": {} }
{ "text": "Glacier National Park is located in Montana and features over 700 miles of hiking trails, pristine forests, and alpine meadows. The park is home to 26 remaining glaciers and over 700 lakes. Known as the Crown of the Continent, it spans over 1 million acres and is a UNESCO World Heritage Site." }
{ "index": {} }
{ "text": "Acadia National Park is located on the coast of Maine and protects the natural beauty of the highest rocky headlands along the Atlantic coastline. The park covers over 49,000 acres and includes mountains, ocean shoreline, woodlands, and lakes. It receives about 4 million visitors annually." }
`;

export const sampleEsqlData = `{ "index": {} }
{ "title": "Perfect Pancakes: A Fluffy Breakfast Delight", "description": "Learn the secrets to making the fluffiest pancakes, so amazing you won't believe your tastebuds. This recipe uses buttermilk and a special folding technique to create light, airy pancakes that are perfect for lazy Sunday mornings.", "author": "Maria Rodriguez", "date": "2023-05-01", "category": "Breakfast", "tags": ["pancakes", "breakfast", "easy recipes"], "rating": 4.8 }
{ "index": {} }
{ "title": "Spicy Thai Green Curry: A Vegetarian Adventure", "description": "Dive into the flavors of Thailand with this vibrant green curry. Packed with vegetables and aromatic herbs, this dish is both healthy and satisfying. Don't worry about the heat - you can easily adjust the spice level to your liking.", "author": "Liam Chen", "date": "2023-05-05", "category": "Main Course", "tags": ["thai", "vegetarian", "curry", "spicy"], "rating": 4.6 }
{ "index": {} }
{ "title": "Classic Beef Stroganoff: A Creamy Comfort Food", "description": "Indulge in this rich and creamy beef stroganoff. Tender strips of beef in a savory mushroom sauce, served over a bed of egg noodles. It's the ultimate comfort food for chilly evenings.", "author": "Emma Watson", "date": "2023-05-10", "category": "Main Course", "tags": ["beef", "pasta", "comfort food"], "rating": 4.7 }
{ "index": {} }
{ "title": "Vegan Chocolate Avocado Mousse", "description": "Discover the magic of avocado in this rich, vegan chocolate mousse. Creamy, indulgent, and secretly healthy, it's the perfect guilt-free dessert for chocolate lovers.", "author": "Alex Green", "date": "2023-05-15", "category": "Dessert", "tags": ["vegan", "chocolate", "avocado", "healthy dessert"], "rating": 4.5 }
{ "index": {} }
{ "title": "Crispy Oven-Fried Chicken", "description": "Get that perfect crunch without the deep fryer! This oven-fried chicken recipe delivers crispy, juicy results every time. A healthier take on the classic comfort food.", "author": "Maria Rodriguez", "date": "2023-05-20", "category": "Main Course", "tags": ["chicken", "oven-fried", "healthy"], "rating": 4.9 }
{ "index": {} }
{ "title": "Mediterranean Quinoa Salad", "description": "A refreshing and protein-packed salad with quinoa, cherry tomatoes, cucumbers, olives, and feta cheese tossed in a lemon herb dressing. Perfect for meal prep and packed lunches.", "author": "Liam Chen", "date": "2023-06-01", "category": "Salad", "tags": ["mediterranean", "quinoa", "healthy", "meal prep"], "rating": 4.4 }
{ "index": {} }
{ "title": "Homemade Sourdough Bread", "description": "Master the art of sourdough baking with this step-by-step guide. From maintaining your starter to achieving the perfect crust, this recipe covers everything you need to know.", "author": "Emma Watson", "date": "2023-06-10", "category": "Breakfast", "tags": ["bread", "sourdough", "baking", "artisan"], "rating": 4.9 }
{ "index": {} }
{ "title": "Mango Sticky Rice: Thai Street Food Classic", "description": "Sweet, creamy coconut sticky rice topped with ripe mango slices. This beloved Thai dessert is surprisingly easy to make at home and tastes just like the street food version.", "author": "Liam Chen", "date": "2023-06-15", "category": "Dessert", "tags": ["thai", "mango", "sticky rice", "dessert"], "rating": 4.7 }
{ "index": {} }
{ "title": "Smoky Chipotle Black Bean Tacos", "description": "Packed with smoky chipotle flavor, these vegetarian black bean tacos are a weeknight dinner winner. Top with fresh salsa, avocado, and a squeeze of lime for a satisfying meal.", "author": "Alex Green", "date": "2023-06-20", "category": "Main Course", "tags": ["mexican", "vegetarian", "tacos", "spicy"], "rating": 4.6 }
{ "index": {} }
{ "title": "Classic French Onion Soup", "description": "Rich, deeply caramelized onions in a savory beef broth, topped with crusty bread and melted Gruyère cheese. This French bistro classic is worth every minute of slow cooking.", "author": "Maria Rodriguez", "date": "2023-07-01", "category": "Soup", "tags": ["french", "soup", "comfort food", "cheese"], "rating": 4.8 }
`;

export const sampleTimeSeriesData = `{ "create": {} }
{ "@timestamp": "2026-03-01T08:00:00Z", "sensor_id": "STATION_1", "location": "base", "temperature": 24.1 }
{ "create": {} }
{ "@timestamp": "2026-03-01T08:30:00Z", "sensor_id": "STATION_1", "location": "base", "temperature": 25.3 }
{ "create": {} }
{ "@timestamp": "2026-03-01T09:00:00Z", "sensor_id": "STATION_1", "location": "satellite", "temperature": 22.7 }
{ "create": {} }
{ "@timestamp": "2026-03-01T09:30:00Z", "sensor_id": "STATION_2", "location": "base", "temperature": 34.2 }
{ "create": {} }
{ "@timestamp": "2026-03-01T09:15:00Z", "sensor_id": "STATION_2", "location": "satellite", "temperature": 30.2 }
{ "create": {} }
{ "@timestamp": "2026-03-01T10:00:00Z", "sensor_id": "STATION_2", "location": "base", "temperature": 35.8 }
{ "create": {} }
{ "@timestamp": "2026-03-01T09:20:00Z", "sensor_id": "STATION_3", "location": "satellite", "temperature": 20.4 }
{ "create": {} }
{ "@timestamp": "2026-03-01T09:45:00Z", "sensor_id": "STATION_3", "location": "base", "temperature": 21.9 }
{ "create": {} }
{ "@timestamp": "2026-03-01T10:15:00Z", "sensor_id": "STATION_3", "location": "satellite", "temperature": 19.6 }
{ "create": {} }
{ "@timestamp": "2026-03-01T09:25:00Z", "sensor_id": "STATION_4", "location": "base", "temperature": 12.4 }
{ "create": {} }
{ "@timestamp": "2026-03-01T09:10:00Z", "sensor_id": "STATION_4", "location": "base", "temperature": 44.4 }
{ "create": {} }
{ "@timestamp": "2026-03-01T10:30:00Z", "sensor_id": "STATION_4", "location": "satellite", "temperature": 15.2 }
{ "create": {} }
{ "@timestamp": "2026-03-01T09:35:00Z", "sensor_id": "STATION_5", "location": "satellite", "temperature": 32.9 }
{ "create": {} }
{ "@timestamp": "2026-03-01T09:00:00Z", "sensor_id": "STATION_5", "location": "base", "temperature": 23.5 }
{ "create": {} }
{ "@timestamp": "2026-03-01T10:45:00Z", "sensor_id": "STATION_5", "location": "satellite", "temperature": 31.1 }
`;

export const sampleAgentBuilderData = `{ "index": {} }
{ "name": "Snow Crash", "author": "Neal Stephenson", "release_date": "1992-06-01", "page_count": 470 }
{ "index": {} }
{ "name": "Revelation Space", "author": "Alastair Reynolds", "release_date": "2000-03-15", "page_count": 585 }
{ "index": {} }
{ "name": "1984", "author": "George Orwell", "release_date": "1985-06-01", "page_count": 328 }
{ "index": {} }
{ "name": "Fahrenheit 451", "author": "Ray Bradbury", "release_date": "1953-10-15", "page_count": 227 }
{ "index": {} }
{ "name": "Brave New World", "author": "Aldous Huxley", "release_date": "1932-06-01", "page_count": 268 }
{ "index": {} }
{ "name": "The Handmaids Tale", "author": "Margaret Atwood", "release_date": "1985-06-01", "page_count": 311 }
{ "index": {} }
{ "name": "Dune", "author": "Frank Herbert", "release_date": "1965-08-01", "page_count": 412 }
{ "index": {} }
{ "name": "Neuromancer", "author": "William Gibson", "release_date": "1984-07-01", "page_count": 271 }
{ "index": {} }
{ "name": "Foundation", "author": "Isaac Asimov", "release_date": "1951-06-01", "page_count": 244 }
{ "index": {} }
{ "name": "The Left Hand of Darkness", "author": "Ursula K. Le Guin", "release_date": "1969-03-01", "page_count": 286 }
`;
