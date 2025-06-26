// Content script for LinkedIn Hiring Assistant
// This script runs on all LinkedIn pages and can inject the "My Jobs" button

(function() {
    'use strict';
    
    // Only run on LinkedIn pages
    if (!window.location.hostname.includes('linkedin.com')) {
        return;
    }
    
    // Wait for page to load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeExtension);
    } else {
        initializeExtension();
    }
    
    function initializeExtension() {
        // Add My Jobs button to LinkedIn header
        addMyJobsButton();
        
        // Listen for navigation changes (LinkedIn is SPA)
        observePageChanges();
    }
    
    function addMyJobsButton() {
        // Remove existing button if any
        const existingBtn = document.getElementById('linkedin-hiring-assistant-btn');
        if (existingBtn) {
            existingBtn.remove();
        }
        
        // Find LinkedIn header navigation
        const headerNav = document.querySelector('.global-nav__primary-items') || 
                         document.querySelector('.global-nav__nav') ||
                         document.querySelector('nav[role="navigation"]');
        
        if (!headerNav) {
            console.log('LinkedIn header navigation not found, retrying...');
            setTimeout(addMyJobsButton, 1000);
            return;
        }
        
        // Create My Jobs button
        const myJobsBtn = document.createElement('li');
        myJobsBtn.id = 'linkedin-hiring-assistant-btn';
        myJobsBtn.className = 'global-nav__primary-item';
        myJobsBtn.innerHTML = `
            <a href="#" class="global-nav__primary-link" style="display: flex; align-items: center; padding: 0 12px;">
                <div class="global-nav__primary-link-text" style="color: #0a66c2; font-weight: 600;">
                    My Jobs
                </div>
            </a>
        `;
        
        // Add click event
        myJobsBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = 'https://www.linkedin.com/my-items/posted-jobs/';
        });
        
        // Insert button
        if (headerNav.children.length > 0) {
            headerNav.appendChild(myJobsBtn);
        } else {
            headerNav.appendChild(myJobsBtn);
        }
        
        console.log('My Jobs button added to LinkedIn header');
    }
    
    function observePageChanges() {
        // LinkedIn is a SPA, so we need to watch for navigation changes
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Check if header changed
                    const headerChanged = Array.from(mutation.addedNodes).some(node => 
                        node.nodeType === 1 && 
                        (node.querySelector('.global-nav__primary-items') || 
                         node.classList?.contains('global-nav__primary-items'))
                    );
                    
                    if (headerChanged) {
                        setTimeout(addMyJobsButton, 500);
                    }
                }
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    // Function to extract applicant data (can be called from popup)
    window.extractLinkedInApplicants = function() {
        const applicants = [];
        
        try {
            // Use selectors from imp.txt
            const applicantElements = document.querySelectorAll('div[class="hiring-applicants__list-container"] ul li[data-view-name="job-applicant-list-profile-card"]');
            
            applicantElements.forEach((element) => {
                const applicant = {};
                
                // Get profile link
                const profileLink = element.querySelector('a');
                if (profileLink) {
                    applicant.profileLink = profileLink.href;
                    
                    // Extract name from link text or nearby elements
                    applicant.name = profileLink.textContent.trim() || 
                                   element.querySelector('h3, h4, .hiring-applicants-list-item__name')?.textContent.trim() || 
                                   'Unknown';
                }
                
                if (applicant.profileLink) {
                    applicants.push(applicant);
                }
            });
            
            // Send data to extension
            chrome.runtime.sendMessage({
                action: 'logApplicantData',
                data: applicants
            });
            
            return applicants;
            
        } catch (error) {
            console.error('Error extracting LinkedIn applicants:', error);
            return [];
        }
    };
    
})(); 