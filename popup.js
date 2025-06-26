// Make applicants array global
let applicants = [];

// Add a global flag to control fetching
let stopFetchingFlag = false;

// Utility function to check for chrome.storage.local availability
function isChromeStorageLocalAvailable() {
    try {
        return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
    } catch (e) {
        return false;
    }
}

// Utility function to save applicants to chrome local storage
function saveApplicantsToStorage(applicantsArr) {
    if (isChromeStorageLocalAvailable()) {
        chrome.storage.local.set({ applicants: applicantsArr }, function() {
            // Optionally, you can log or show a message here
            // console.log('Applicants data saved to local storage.');
        });
    } else {
        // Fallback: Save to localStorage if chrome.storage.local is not available
        try {
            localStorage.setItem('applicants', JSON.stringify(applicantsArr));
        } catch (e) {
            console.error('Unable to save applicants data:', e);
        }
    }
}

// Utility function to load applicants from chrome local storage
function loadApplicantsFromStorage(callback) {
    if (isChromeStorageLocalAvailable()) {
        chrome.storage.local.get(['applicants'], function(result) {
            callback(result.applicants || []);
        });
    } else {
        // Fallback: Load from localStorage if chrome.storage.local is not available
        try {
            const data = localStorage.getItem('applicants');
            callback(data ? JSON.parse(data) : []);
        } catch (e) {
            console.error('Unable to load applicants data:', e);
            callback([]);
        }
    }
}

// The main fix: Move showStatus call inside the callback for chrome.storage.local.remove
function clearApplicantsFromStorage() {
    if (isChromeStorageLocalAvailable()) {
        chrome.storage.local.remove(['applicants'], function() {
            setTimeout(() => {
                const statusDiv = document.getElementById('status');
                if (typeof showStatus === "function") {
                    showStatus('Applicants data cleared from local storage.', 'success');
                } else if (statusDiv) {
                    statusDiv.textContent = 'Applicants data cleared from local storage.';
                    statusDiv.className = 'status-message success';
                    statusDiv.style.display = 'block';
                    setTimeout(() => {
                        statusDiv.style.display = 'none';
                    }, 3000);
                }
            }, 0);
        });
    } else {
        try {
            localStorage.removeItem('applicants');
            const statusDiv = document.getElementById('status');
            if (typeof showStatus === "function") {
                showStatus('Applicants data cleared from local storage.', 'success');
            } else if (statusDiv) {
                statusDiv.textContent = 'Applicants data cleared from local storage.';
                statusDiv.className = 'status-message success';
                statusDiv.style.display = 'block';
                setTimeout(() => {
                    statusDiv.style.display = 'none';
                }, 3000);
            }
        } catch (e) {
            console.error('Unable to clear applicants data:', e);
            if (typeof showStatus === "function") {
                showStatus('Error clearing applicants data.', 'error');
            }
        }
    }
}

// Function to stop fetching
function stopFetching() {
    stopFetchingFlag = true;
    // Use globalShowStatus to avoid ReferenceError if showStatus is not defined
    if (typeof globalShowStatus === "function") {
        globalShowStatus('Stopping applicant extraction...', 'warning');
    }
}

// Function to extract qualification status (to be injected)
function extractQualificationStatus() {
    const result = {
        mustHaveMatched: false,
        preferredMatched: false,
        anyMatched: false
    };

    try {
        const qualificationHeaders = document.querySelectorAll(
            'div[id^="hiring-screening-questions-"] h3.t-16.t-bold'
        );

        qualificationHeaders.forEach((header) => {
            const text = header.textContent.trim();
            const match = text.match(/(\d+)\s+out of\s+(\d+)/i);

            if (match) {
                const met = parseInt(match[1]);
                const total = parseInt(match[2]);

                if (text.toLowerCase().includes("must-have")) {
                    result.mustHaveMatched = met === total;
                } else if (text.toLowerCase().includes("preferred")) {
                    result.preferredMatched = met === total;
                }
            }
        });

        result.anyMatched = result.mustHaveMatched || result.preferredMatched;
    } catch (error) {
        console.error("Error extracting qualification status:", error);
    }

    return result;
}

// ---- JSZip integration ----
// JSZip is now included as a local script in popup.html
/**
 * Loads JSZip from the global window object.
 * Returns a Promise that resolves to the JSZip constructor.
 */
function loadJSZip() {
    return new Promise((resolve, reject) => {
        if (typeof JSZip !== 'undefined') {
            resolve(JSZip);
        } else {
            reject(new Error('JSZip is not available. Please ensure JSZip is included as a local script in popup.html.'));
        }
    });
}

// Define a global showStatus function to avoid ReferenceError
function globalShowStatus(message, type) {
    const statusDiv = document.getElementById('status');
    if (!statusDiv) return;
    statusDiv.textContent = message;
    statusDiv.className = `status-message ${type}`;
    statusDiv.style.display = 'block';
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 3000);
}

document.addEventListener('DOMContentLoaded', function() {
    const myJobsBtn = document.getElementById('myJobsBtn');
    const fetchApplicantsBtn = document.getElementById('fetchApplicantsBtn');
    const clearApplicantsBtn = document.getElementById('clearApplicantsBtn');
    const downloadResumesBtn = document.getElementById('downloadResumesBtn');
    const statusDiv = document.getElementById('status');
    const applicantsDataDiv = document.getElementById('applicantsData');
    const stopFetchBtn = document.getElementById('stopFetchBtn');

    // On load, show any previously saved applicants
    loadApplicantsFromStorage(function(storedApplicants) {
        applicants = storedApplicants;
        displayApplicants(applicants);
    });

    // My Jobs button - redirect to LinkedIn hiring jobs
    if (myJobsBtn) {
        myJobsBtn.addEventListener('click', function() {
            if (typeof chrome !== "undefined" && chrome.tabs) {
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    chrome.tabs.update(tabs[0].id, {
                        url: 'https://www.linkedin.com/my-items/posted-jobs/'
                    });
                    globalShowStatus('Redirecting to My Jobs...', 'success');
                    window.close();
                });
            } else {
                window.open('https://www.linkedin.com/my-items/posted-jobs/', '_blank');
                globalShowStatus('Redirecting to My Jobs...', 'success');
            }
        });
    }

    if (clearApplicantsBtn) {
        clearApplicantsBtn.addEventListener('click', function() {
            clearApplicantsFromStorage();
        });
    }

    if (downloadResumesBtn) {
        downloadResumesBtn.addEventListener('click', function() {
            downloadResumes();
        });
    }

    if (stopFetchBtn) {
        stopFetchBtn.addEventListener('click', function() {
            stopFetching();
        });
    }

    // Fetch Applicants button - extract applicant data from current page and all pagination pages
    if (fetchApplicantsBtn) {
        fetchApplicantsBtn.addEventListener('click', function() {
            if (typeof chrome === "undefined" || !chrome.tabs || !chrome.scripting) {
                globalShowStatus('This feature requires Chrome extension APIs.', 'error');
                return;
            }
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                const currentTab = tabs[0];

                // Check if we're on a LinkedIn page
                if (!currentTab.url.includes('linkedin.com')) {
                    globalShowStatus('Please navigate to LinkedIn first', 'error');
                    return;
                }

                globalShowStatus('Starting applicant extraction...', 'success');
                applicants = []; // Reset global applicants array
                saveApplicantsToStorage(applicants); // Clear storage at start

                // Reset stop flag at the start of extraction
                stopFetchingFlag = false;

                // Main function to iterate through all pages and extract applicants
                (async function extractFromAllPages() {
                    // Get pagination buttons to determine how many pages to iterate through
                    const totalPages = await new Promise((resolve) => {
                        chrome.scripting.executeScript({
                            target: {tabId: currentTab.id},
                            func: function() {
                                // Use the correct selector for pagination buttons
                                const buttons = Array.from(
                                    document.querySelectorAll('ul.artdeco-pagination__pages button[aria-label^="Page"]')
                                ).filter(btn => btn.innerText.trim() !== '…');
                                return buttons.length;
                            }
                        }, function(results) {
                            if (results && results[0] && typeof results[0].result === 'number') {
                                resolve(results[0].result > 0 ? results[0].result : 1);
                            } else {
                                resolve(1);
                            }
                        });
                    });

                    globalShowStatus(`Found ${totalPages} page(s) to process...`, 'success');

                    // Process each page sequentially
                    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
                        if (stopFetchingFlag) {
                            globalShowStatus('Applicant extraction stopped by user.', 'warning');
                            break;
                        }

                        globalShowStatus(`Processing page ${pageIndex + 1} of ${totalPages}...`, 'success');

                        // If not the first page, click the pagination button and wait for page to load
                        if (pageIndex > 0) {
                            await new Promise((resolve) => {
                                chrome.scripting.executeScript({
                                    target: {tabId: currentTab.id},
                                    func: function(pageIdx) {
                                        const buttons = Array.from(
                                            document.querySelectorAll('ul.artdeco-pagination__pages button[aria-label^="Page"]')
                                        ).filter(btn => btn.innerText.trim() !== '…');
                                        if (buttons[pageIdx]) {
                                            buttons[pageIdx].click();
                                        }
                                    },
                                    args: [pageIndex]
                                }, () => {
                                    setTimeout(resolve, 2000); // Wait for page to load
                                });
                            });
                        }

                        // Extract applicants from current page
                        const pageApplicants = await new Promise((resolve) => {
                            chrome.scripting.executeScript({
                                target: {tabId: currentTab.id},
                                func: function() {
                                    const applicants = [];
                                    const applicantElements = document.querySelectorAll('div[class="hiring-applicants__list-container"] ul li[data-view-name="job-applicant-list-profile-card"]');
                                    applicantElements.forEach((element, idx) => {
                                        const applicant = {};
                                        const linkElement = element.querySelector('a');
                                        if (linkElement) {
                                            applicant.profileLink = linkElement.href;
                                            const nameElement = linkElement.querySelector('.artdeco-entity-lockup__title.hiring-people-card__title');
                                            if (nameElement) {
                                                applicant.name = nameElement.textContent.trim();
                                            } else {
                                                applicant.name = 'Unknown';
                                            }
                                            // Create a unique selector for the linkElement
                                            applicant.linkSelector = `div.hiring-applicants__list-container ul li[data-view-name="job-applicant-list-profile-card"]:nth-child(${idx + 1}) a`;
                                        }
                                        if (applicant.profileLink) {
                                            applicants.push(applicant);
                                        }
                                    });
                                    return applicants;
                                }
                            }, function(results) {
                                if (results && results[0] && results[0].result) {
                                    resolve(results[0].result);
                                } else {
                                    resolve([]);
                                }
                            });
                        });

                        // Iterate over each applicant on this page, one by one, and fetch their resume link
                        // MODIFIED LOOP: Check qualification status before fetching resume
                        let filteredPageApplicants = [];
                        for (let i = 0; i < pageApplicants.length; i++) {
                            if (stopFetchingFlag) {
                                globalShowStatus('Applicant extraction stopped by user.', 'warning');
                                break;
                            }

                            // Click the linkElement to open the profile section
                            await new Promise((resolveClick) => {
                                chrome.scripting.executeScript({
                                    target: {tabId: currentTab.id},
                                    func: function(selector) {
                                        const el = document.querySelector(selector);
                                        if (el) el.click();
                                    },
                                    args: [pageApplicants[i].linkSelector]
                                }, () => {
                                    setTimeout(resolveClick, 2000);
                                });
                            });

                            // Extract qualification status from the opened profile section
                            const qualificationStatus = await new Promise((resolve) => {
                                chrome.scripting.executeScript({
                                    target: {tabId: currentTab.id},
                                    func: extractQualificationStatus
                                }, function(results) {
                                    if (results && results[0] && results[0].result) {
                                        resolve(results[0].result);
                                    } else {
                                        resolve({ anyMatched: false });
                                    }
                                });
                            });

                            if (qualificationStatus && qualificationStatus.anyMatched) {
                                // Only fetch resume if anyMatched is true
                                const resumeLink = await new Promise((resolve) => {
                                    chrome.scripting.executeScript({
                                        target: {tabId: currentTab.id},
                                        func: function() {
                                            let resumeDownloadLink = document.querySelector('div.ui-attachment.ui-attachment--doc a.ui-attachment__download-button')?.href;
                                            if (!resumeDownloadLink) {
                                                resumeDownloadLink = document.querySelector('div[class="hiring-resume-viewer__resume-wrapper--collapsed"] a')?.href;
                                            }
                                            if (!resumeDownloadLink) {
                                                const resumeDiv = Array.from(
                                                    document.querySelectorAll('main[class="hiring-applicants__right-column"] div')
                                                ).find(div =>
                                                    div.querySelector('h2')?.innerText.trim() === 'Resume' &&
                                                    div.querySelector('a[href]')
                                                );
                                                resumeDownloadLink = resumeDiv?.querySelector('a')?.href;
                                            }
                                            return resumeDownloadLink || null;
                                        }
                                    }, function(results) {
                                        if (results && results[0] && results[0].result) {
                                            resolve(results[0].result);
                                        } else {
                                            resolve(null);
                                        }
                                    });
                                });

                                pageApplicants[i].resumeLink = resumeLink;
                                filteredPageApplicants.push(pageApplicants[i]);
                                // Optionally update UI after each applicant
                                displayApplicants(applicants.concat(filteredPageApplicants));
                                // Save progress to storage after each applicant
                                saveApplicantsToStorage(applicants.concat(filteredPageApplicants));
                            } else {
                                // Skip this applicant and do not add to filteredPageApplicants
                                globalShowStatus(`Skipped ${pageApplicants[i].name || 'Unknown'} (did not match qualifications)`, 'warning');
                            }
                        }

                        // Add filtered page applicants to global applicants array
                        applicants = applicants.concat(filteredPageApplicants);
                        displayApplicants(applicants); // Update UI with all applicants so far
                        saveApplicantsToStorage(applicants); // Save to storage after each page

                        // If stopped during applicant loop, break out of page loop as well
                        if (stopFetchingFlag) {
                            break;
                        }
                    }

                    if (stopFetchingFlag) {
                        globalShowStatus(`Stopped. Found ${applicants.length} applicants so far.`, 'warning');
                    } else {
                        globalShowStatus(`Completed! Found ${applicants.length} total applicants across ${totalPages} page(s)`, 'success');
                    }
                    saveApplicantsToStorage(applicants); // Final save
                })();
            });
        });
    }

    // Redefine showStatus as a wrapper for globalShowStatus for compatibility
    function showStatus(message, type) {
        globalShowStatus(message, type);
    }

    function displayApplicants(applicantsList) {
        if (!applicantsDataDiv) return;
        applicantsDataDiv.innerHTML = '';
        
        if (applicantsList.length === 0) {
            applicantsDataDiv.innerHTML = '<p>No applicants found</p>';
            return;
        }

        applicantsList.forEach((applicant, index) => {
            const applicantDiv = document.createElement('div');
            applicantDiv.className = 'applicant-item';
            
            applicantDiv.innerHTML = `
                <div class="applicant-name">${applicant.name || 'Unknown'}</div>
                ${applicant.profileLink ? `<div><a href="${applicant.profileLink}" class="applicant-link" target="_blank">Profile Link</a></div>` : ''}
                ${applicant.resumeLink ? `<div><a href="${applicant.resumeLink}" class="applicant-link" target="_blank">Resume Download</a></div>` : ''}
            `;
            
            applicantsDataDiv.appendChild(applicantDiv);
        });
    }
});

// Extracts basic applicant info from the applicants list page
function extractApplicantData() {
    const applicants = [];
    try {
        const applicantElements = document.querySelectorAll('div[class="hiring-applicants__list-container"] ul li[data-view-name="job-applicant-list-profile-card"]');
        applicantElements.forEach((element) => {
            const applicant = {};
            const linkElement = element.querySelector('a');
            if (linkElement) {
                applicant.profileLink = linkElement.href;
                const nameElement = linkElement.querySelector('.artdeco-entity-lockup__title.hiring-people-card__title');
                if (nameElement) {
                    applicant.name = nameElement.textContent.trim();
                } else {
                    applicant.name = 'Unknown';
                }
            }
            if (applicant.profileLink) {
                applicants.push(applicant);
            }
        });
    } catch (error) {
        console.error('Error extracting applicant data:', error);
    }
    return applicants;
}

// This function will be injected into the applicant's profile page to extract the resume link
function extractResumeLinkFromProfile() {
    let resumeDownloadLink = document.querySelector('div.ui-attachment.ui-attachment--doc a.ui-attachment__download-button')?.href;
    if (!resumeDownloadLink) {
        resumeDownloadLink = document.querySelector('div[class="hiring-resume-viewer__resume-wrapper--collapsed"] a')?.href;
    }
    return resumeDownloadLink || null;
}

// Download all resumes as a zip file
function downloadResumes() {
    // Helper to sanitize file names
    function sanitizeFileName(name) {
        return name.replace(/[\/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_');
    }

    // Helper to fetch a file as blob
    function fetchResumeBlob(url) {
        return fetch(url)
            .then(response => {
                if (!response.ok) throw new Error('Failed to fetch resume');
                return response.blob();
            });
    }

    // Main trigger function
    function triggerDownload(applicantsList) {
        // Filter applicants with resume links
        const applicantsWithResumes = applicantsList.filter(applicant => applicant.resumeLink);

        if (applicantsWithResumes.length === 0) {
            globalShowStatus('No resumes to download.', 'warning');
            return;
        }

        globalShowStatus('Preparing resumes zip...', 'success');

        loadJSZip().then(JSZip => {
            const zip = new JSZip();
            let completed = 0;
            let failed = 0;

            // For progress feedback
            function updateProgress() {
                globalShowStatus(`Downloading resumes: ${completed + failed}/${applicantsWithResumes.length}`, 'success');
            }

            // Fetch all resumes as blobs and add to zip
            const fetchPromises = applicantsWithResumes.map(applicant => {
                const fileName = sanitizeFileName(applicant.name || 'Unknown') + '.pdf';
                return fetchResumeBlob(applicant.resumeLink)
                    .then(blob => {
                        zip.file(fileName, blob);
                        completed++;
                        updateProgress();
                    })
                    .catch(err => {
                        failed++;
                        updateProgress();
                        // Optionally, add a text file for failed downloads
                        zip.file(fileName + '.FAILED.txt', `Failed to download resume for ${applicant.name || 'Unknown'}: ${err.message}`);
                    });
            });

            Promise.all(fetchPromises).then(() => {
                zip.generateAsync({ type: 'blob' }).then(function(content) {
                    // Download the zip file
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(content);
                    a.download = 'applicants_resumes.zip';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    globalShowStatus(`Downloaded ${completed} resumes${failed ? `, ${failed} failed` : ''}.`, failed ? 'warning' : 'success');
                });
            });
        }).catch(err => {
            // More informative error message and suggestion
            globalShowStatus('Failed to load zip library. Please ensure JSZip is included as a local script in your extension and referenced in popup.html.', 'error');
            // Optionally, log the error for debugging
            if (err) {
                console.error('JSZip load error:', err);
            }
        });
    }

    if (applicants && applicants.length > 0) {
        triggerDownload(applicants);
    } else {
        loadApplicantsFromStorage(function(storedApplicants) {
            triggerDownload(storedApplicants);
        });
    }
}
