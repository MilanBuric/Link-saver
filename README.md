Link Saver

<img width="796" height="597" alt="image" src="https://github.com/user-attachments/assets/8c193a15-3f42-4d54-be8b-3997582f7d43" />


Overview
Link Saver is a lightweight and practical Chrome extension designed to help users efficiently save, organize, and manage web links.
The extension allows users to manually input URLs, save the currently active browser tab, selectively delete stored links, remove all saved links, and shorten URLs using the TinyURL API for improved readability and sharing.

Objectives
The primary goal of this project was to develop a clean and functional browser extension that demonstrates:
Efficient link management within a compact popup interface
Integration with Chrome Extension APIs
Persistent client-side data storage
External API integration for URL shortening

Key functional objectives include:
Allowing users to manually save URLs
Saving the currently active browser tab with a single click
Supporting selective and bulk deletion of stored links
Persisting data across browser sessions using chrome.storage.sync
Automatically shortening URLs via the TinyURL API

Technologies Used
JavaScript (ES6) – Core application logic, DOM manipulation, and event handling
HTML5 – Popup structure and UI layout
CSS3 – Styling and layout design
Chrome Extension APIs
chrome.storage.sync – Persistent cross-session storage
chrome.tabs – Accessing the active browser tab
TinyURL API – External service integration for URL shortening
Fetch API – Handling asynchronous HTTP requests

How It Works

Saving Links Manually
Users can enter a URL into the input field and click the "Save" button or press Enter.
The URL is validated, added to an internal array, and stored using chrome.storage.sync.

Saving the Active Tab
By clicking the "Save Tab" button, the extension retrieves the current tab’s URL using chrome.tabs.query.
The URL is then shortened via the TinyURL API before being saved to storage.

Rendering Links
All stored links are dynamically rendered into a list. Each entry includes:
A clickable hyperlink (opens in a new tab)
A checkbox for selection
The interface updates automatically whenever the stored data changes.

Deleting Links
Users can:
Delete selected links using checkboxes
Remove all saved links using the "Delete All" button
The internal data structure and Chrome storage are updated immediately after deletion.

Persistent Storage
All links are stored using chrome.storage.sync, ensuring data persistence even after the browser is closed and reopened.

Additional Features
Duplicate link prevention
Real-time UI updates
Error handling for API failures
Keyboard support (Enter key for faster input)
User feedback via alert notifications
JSON export functionality
JSON import with merge support

Future Improvements
Implement link categorization and tagging
Add filtering and search functionality
Improve UI/UX design

Replace alert-based feedback with modern notification components
