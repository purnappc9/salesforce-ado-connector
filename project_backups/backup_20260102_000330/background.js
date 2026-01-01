// Background service worker
console.log("SF-ADO Extension Background Worker Loaded");

// Listen for messages if we need to offload processing
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "log_status") {
        console.log("Status:", request.message);
    }
});
