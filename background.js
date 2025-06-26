// Background service worker for LinkedIn Hiring Assistant

chrome.runtime.onInstalled.addListener(() => {
    console.log('LinkedIn Hiring Assistant installed');

    // Safely check if chrome.contextMenus exists before using it
    if (chrome.contextMenus && typeof chrome.contextMenus.create === 'function') {
        chrome.contextMenus.create({
            id: 'openMyJobs',
            title: 'Open LinkedIn My Jobs',
            contexts: ['page'],
            documentUrlPatterns: ['https://*.linkedin.com/*']
        });
    } else {
        console.warn('chrome.contextMenus API is not available.');
    }
});

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openMyJobs') {
        chrome.tabs.create({
            url: 'https://www.linkedin.com/hiring/jobs'
        });
    }
    
    if (request.action === 'logApplicantData') {
        console.log('Applicant Data:', request.data);
    }
});
