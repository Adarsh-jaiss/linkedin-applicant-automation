// Make applicants array global
let applicants = [];

document.addEventListener('DOMContentLoaded', function() {
    const myJobsBtn = document.getElementById('myJobsBtn');
    const fetchApplicantsBtn = document.getElementById('fetchApplicantsBtn');
    const statusDiv = document.getElementById('status');
    const applicantsDataDiv = document.getElementById('applicantsData');

    // My Jobs button - redirect to LinkedIn hiring jobs
    myJobsBtn.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.update(tabs[0].id, {
                url: 'https://www.linkedin.com/my-items/posted-jobs/'
            });
            showStatus('Redirecting to My Jobs...', 'success');
            window.close();
        });
    });

    // Fetch Applicants button - extract applicant data from current page and all pagination pages
    fetchApplicantsBtn.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentTab = tabs[0];

            // Check if we're on a LinkedIn page
            if (!currentTab.url.includes('linkedin.com')) {
                showStatus('Please navigate to LinkedIn first', 'error');
                return;
            }

            showStatus('Starting applicant extraction...', 'success');
            applicants = []; // Reset global applicants array

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

                showStatus(`Found ${totalPages} page(s) to process...`, 'success');

                // Process each page sequentially
                for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
                    showStatus(`Processing page ${pageIndex + 1} of ${totalPages}...`, 'success');

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
                    for (let i = 0; i < pageApplicants.length; i++) {
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
                                // Wait for the profile section to load after click
                                setTimeout(resolveClick, 2000);
                            });
                        });

                        // Extract the resume link from the opened profile section
                        const resumeLink = await new Promise((resolve) => {
                            chrome.scripting.executeScript({
                                target: {tabId: currentTab.id},
                                func: function() {
                                    // Try both selectors for resume download
                                    let resumeDownloadLink = document.querySelector('div.ui-attachment.ui-attachment--doc a.ui-attachment__download-button')?.href;
                                    if (!resumeDownloadLink) {
                                        // Try alternate selector
                                        resumeDownloadLink = document.querySelector('div[class="hiring-resume-viewer__resume-wrapper--collapsed"] a')?.href;
                                    }
                                    // Try the "Resume" section in the right column as a fallback
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
                        // Optionally update UI after each applicant
                        displayApplicants(applicants.concat(pageApplicants.slice(0, i + 1)));
                    }

                    // Add page applicants to global applicants array
                    applicants = applicants.concat(pageApplicants);
                    displayApplicants(applicants); // Update UI with all applicants so far
                }

                showStatus(`Completed! Found ${applicants.length} total applicants across ${totalPages} page(s)`, 'success');
            })();
        });
    });

    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = `status-message ${type}`;
        statusDiv.style.display = 'block';
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }

    function displayApplicants(applicantsList) {
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