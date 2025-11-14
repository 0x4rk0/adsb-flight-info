// ==UserScript==
// @name         ADSBExchange Route Info Popup
// @version      1.0
// @description  Show departure and arrival airports when a flight is selected on ADS-B Exchange or ADSB.fi
// @match        https://globe.adsbexchange.com/*
// @match        https://globe.adsb.fi/*
// @match        *://*/tar1090/*
// @match        *://*:8504/*
// @grant        GM.xmlHttpRequest
// @connect      flightaware.com
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Utility: create and style the popup element (initially hidden)
    let popup = document.createElement('div');
    popup.id = 'adsbRoutePopup';
    popup.style.position = 'relative';  // positioned relative to callsign element’s parent
    popup.style.marginTop = '4px';
    popup.style.padding = '6px 8px';
    popup.style.background = '#fefefe';
    popup.style.border = '1px solid #333';
    popup.style.borderRadius = '4px';
    popup.style.color = '#000';
    popup.style.font = '14px Arial, sans-serif';
    popup.style.zIndex = '9999';
    popup.style.display = 'none';  // start hidden

    let callsignElement = null;
    let observer = null;
    let lastCallsign = "";
    let activeRequest = null;

    // Function to fetch and display route info for a given callsign
    function fetchRouteInfo(callsign) {
        // Abort any ongoing request for a previous callsign
        if (activeRequest) {
            try { activeRequest.abort(); } catch(e) {}
            activeRequest = null;
        }
        // If callsign is empty or undefined, do nothing (or hide popup just in case)
        if (!callsign) {
            popup.style.display = 'none';
            popup.textContent = "";  // clear content
            return;
        }
        // Show loading state in popup
        popup.textContent = "Loading route info for " + callsign + "...";
        popup.style.display = 'block';

        // Send request to FlightAware for the flight page
        activeRequest = GM.xmlHttpRequest({
            method: "GET",
            url: "https://flightaware.com/live/flight/" + encodeURIComponent(callsign),
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100",
                "Accept": "text/html"
            },
            onload: function(response) {
                activeRequest = null;
                // If user has selected another flight in the meantime, ignore this response
                if (callsign !== lastCallsign) return;

                // Try to extract the trackpollBootstrap JSON data from the response
                let text = response.responseText;
                let data = null;
                try {
                    let idx = text.indexOf("var trackpollBootstrap = ");
                    if (idx !== -1) {
                        // Isolate the JSON string assigned to trackpollBootstrap
                        let start = idx + "var trackpollBootstrap = ".length;
                        let endScript = text.indexOf("</script>", start);
                        let scriptContent = text.substring(start, endScript);
                        // Remove trailing semicolon if present
                        if (scriptContent.endsWith(";")) {
                            scriptContent = scriptContent.slice(0, -1);
                        }
                        // Parse JSON
                        data = JSON.parse(scriptContent);
                    }
                } catch (e) {
                    console.error("Failed to parse FlightAware data:", e);
                }

                let originStr = "", destStr = "";
                if (data && data.flights) {
                    try {
                        // Get the first flight object (the key is dynamic)
                        let flightKey = Object.keys(data.flights)[0];
                        let flightData = data.flights[flightKey];
                        // Some flights info may be under activityLog -> flights array
                        if (flightData.activityLog && flightData.activityLog.flights && flightData.activityLog.flights.length > 0) {
                            let currentFlight = flightData.activityLog.flights[0];
                            let originInfo = currentFlight.origin;
                            let destInfo = currentFlight.destination;
                            if (originInfo && destInfo) {
                                // Compose origin string with location and code
                                let originLoc = originInfo.friendlyLocation || "";
                                let originCode = originInfo.icao || originInfo.iata || originInfo.code || "";
                                originStr = originLoc + (originCode ? " (" + originCode + ")" : "");
                                // Compose destination string
                                let destLoc = destInfo.friendlyLocation || "";
                                let destCode = destInfo.icao || destInfo.iata || destInfo.code || "";
                                destStr = destLoc + (destCode ? " (" + destCode + ")" : "");
                            }
                        }
                        // If not found in activityLog, try top-level origin/destination (if available)
                        if (!originStr && flightData.origin && flightData.destination) {
                            let originCode = flightData.origin.code || flightData.origin.icao || flightData.origin.iata || "";
                            let destCode = flightData.destination.code || flightData.destination.icao || flightData.destination.iata || "";
                            originStr = originCode ? originCode : "";
                            destStr = destCode ? destCode : "";
                        }
                    } catch (err) {
                        console.warn("Could not extract origin/destination from data:", err);
                    }
                }

                if (originStr && destStr) {
                    // Display the fetched route info
                    popup.innerHTML = `<b>Departure:</b> ${originStr}<br><b>Arrival:</b> ${destStr}`;
                } else {
                    // No route info found (e.g., flight plan not available)
                    popup.innerHTML = `<i>No route information available for this flight</i>`;
                }
            },
            onerror: function(err) {
                activeRequest = null;
                if (callsign !== lastCallsign) return;
                console.error("Route info request failed:", err);
                popup.innerHTML = `<i>Error retrieving route info</i>`;
            }
        });
    }

    // Initialize the observer once the callsign element is present
    function initObserver() {
        callsignElement = document.getElementById('selected_callsign');
        if (!callsignElement) {
            // Retry if element not yet in DOM
            requestAnimationFrame(initObserver);
            return;
        }
        // Insert the popup into the DOM, just after the callsign element
        callsignElement.parentNode.insertBefore(popup, callsignElement.nextSibling);

        // Set up MutationObserver on the callsign text node
        observer = new MutationObserver(function(mutations) {
            mutations.forEach(mutation => {
                let newCallsign = callsignElement.textContent.trim();
                // Only act if the callsign actually changed
                if (newCallsign === lastCallsign) return;
                lastCallsign = newCallsign;
                if (newCallsign === "" || newCallsign.length === 0) {
                    // No flight selected, hide popup
                    popup.style.display = 'none';
                    popup.textContent = "";
                } else {
                    // New flight selected, fetch and show route info
                    fetchRouteInfo(newCallsign);
                }
            });
        });
        observer.observe(callsignElement, { childList: true, characterData: true, subtree: true });
    }

    // Start the process
    initObserver();
})();
