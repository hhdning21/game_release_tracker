// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'searchGames') {
        searchGames(request.query).then(sendResponse);
        return true; // Keep channel open for async response
    }
});

async function searchGames(query) {
    try {
        // Search using CheapShark API (free, no CORS issues)
        const searchUrl = `https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(query)}&limit=10`;
        const response = await fetch(searchUrl);
        const data = await response.json();
        
        if (!data || data.length === 0) {
            return { results: [] };
        }
        
        // Format results
        const results = data.slice(0, 5).map(game => {
            const cheapest = parseFloat(game.cheapest);
            const normal = parseFloat(game.normalPrice || game.cheapest);
            
            return {
                id: game.gameID,
                title: game.external,
                price: cheapest > 0 ? `$${cheapest.toFixed(2)}` : 'Free',
                priceValue: cheapest,
                shop: cheapest < normal ? `On Sale! (was $${normal.toFixed(2)})` : 'Best price available',
                url: `https://www.cheapshark.com/redirect?dealID=${game.cheapestDealID}`
            };
        });
        
        return { results };
        
    } catch (error) {
        console.error('Search error:', error);
        return { error: 'Search failed. Please try again.' };
    }
}

// Check prices periodically
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'checkPrices') {
        await checkAllPrices();
    }
});

// Initialize alarm on install
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('checkPrices', { periodInMinutes: 60 });
});

async function checkAllPrices() {
    const tracked = await chrome.storage.local.get('trackedGames') || {};
    const games = tracked.trackedGames || {};
    
    for (const [id, game] of Object.entries(games)) {
        try {
            // Use the title search instead, as it's more reliable
            const searchUrl = `https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(game.title)}&limit=5`;
            const response = await fetch(searchUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            
            const data = await response.json();
            
            // Find the exact game match
            const gameMatch = data.find(g => g.gameID === id) || data[0];
            
            if (gameMatch) {
                const currentPrice = parseFloat(gameMatch.cheapest);
                
                // Check if price dropped below target
                if (currentPrice <= game.targetPrice && currentPrice < game.currentPrice) {
                    // Price drop detected!
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'icon48.png',
                        title: '🎉 Price Drop Alert!',
                        message: `${game.title} is now ${currentPrice.toFixed(2)} (was ${game.currentPrice.toFixed(2)})`,
                        priority: 2,
                        requireInteraction: true
                    });
                    
                    console.log(`Price drop: ${game.title} - ${currentPrice}`);
                }
                
                // Always update current price
                games[id].currentPrice = currentPrice;
                games[id].lastChecked = Date.now();
            }
        } catch (error) {
            console.error('Error checking price for', game.title, ':', error.message);
            // Mark as checked even if failed
            games[id].lastChecked = Date.now();
            games[id].lastError = error.message;
        }
    }
    
    // Save updated prices
    await chrome.storage.local.set({ trackedGames: games });
    console.log('Price check completed at', new Date().toLocaleTimeString());
}

// Check prices when extension starts
chrome.runtime.onStartup.addListener(() => {
    console.log('Extension started, checking prices...');
    checkAllPrices();
});

// Also check on install
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed, setting up alarms...');
    checkAllPrices();
});

// Manual trigger for testing (optional)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'searchGames') {
        searchGames(request.query).then(sendResponse);
        return true;
    }
    if (request.action === 'checkPricesNow') {
        checkAllPrices().then(() => sendResponse({ success: true }));
        return true;
    }
});