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

    // Fetch Applicants button - extract applicant data from current page
    fetchApplicantsBtn.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentTab = tabs[0];

            // Check if we're on a LinkedIn page
            if (!currentTab.url.includes('linkedin.com')) {
                showStatus('Please navigate to LinkedIn first', 'error');
                return;
            }

            // Step 1: Extract applicant data and a unique selector for each linkElement
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
                            // Use nth-child for the li, then 'a' inside
                            applicant.linkSelector = `div.hiring-applicants__list-container ul li[data-view-name="job-applicant-list-profile-card"]:nth-child(${idx + 1}) a`;
                        }
                        if (applicant.profileLink) {
                            applicants.push(applicant);
                        }
                    });
                    return applicants;
                }
            }, function(results) {
                if (chrome.runtime.lastError) {
                    showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
                    return;
                }

                if (results && results[0] && results[0].result) {
                    applicants = results[0].result; // assign to global

                    // Step 2: For each applicant, click their linkElement to open their details, then extract resume link
                    (async function fetchAllResumes() {
                        for (let i = 0; i < applicants.length; i++) {
                            // Click the linkElement to open the profile section (no navigation)
                            await new Promise((resolveClick) => {
                                chrome.scripting.executeScript({
                                    target: {tabId: currentTab.id},
                                    func: function(selector) {
                                        const el = document.querySelector(selector);
                                        if (el) el.click();
                                    },
                                    args: [applicants[i].linkSelector]
                                }, () => {
                                    // Wait for the profile section to load after click
                                    setTimeout(resolveClick, 1200); // Adjust delay if needed
                                });
                            });

                            // Now extract the resume link from the opened profile section
                            const resumeLink = await new Promise((resolve) => {
                                chrome.scripting.executeScript({
                                    target: {tabId: currentTab.id},
                                    func: function() {
                                        let resumeDownloadLink = document.querySelector('div.ui-attachment.ui-attachment--doc a.ui-attachment__download-button')?.href;
                                        if (!resumeDownloadLink) {
                                            resumeDownloadLink = document.querySelector('div[class="hiring-resume-viewer__resume-wrapper--collapsed"] a')?.href;
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

                            applicants[i].resumeLink = resumeLink;
                            displayApplicants(applicants); // update UI as we go
                        }
                        showStatus(`Found ${applicants.length} applicants`, 'success');
                    })();
                } else {
                    showStatus('No applicants found on this page', 'error');
                }
            });
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