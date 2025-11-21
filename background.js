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
            const lookupUrl = `https://www.cheapshark.com/api/1.0/games?id=${id}`;
            const response = await fetch(lookupUrl);
            const data = await response.json();
            
            if (data && data.deals && data.deals.length > 0) {
                const bestDeal = data.deals.reduce((best, deal) => {
                    return parseFloat(deal.price) < parseFloat(best.price) ? deal : best;
                });
                
                const currentPrice = parseFloat(bestDeal.price);
                
                if (currentPrice <= game.targetPrice && currentPrice < game.currentPrice) {
                    // Price drop detected!
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'icon48.png',
                        title: '🎉 Price Drop Alert!',
                        message: `${game.title} is now $${currentPrice.toFixed(2)} (Target: $${game.targetPrice.toFixed(2)})`,
                        priority: 2,
                        requireInteraction: true
                    });
                }
                
                // Update stored price
                games[id].currentPrice = currentPrice;
            }
        } catch (error) {
            console.error('Error checking price for', game.title, error);
        }
    }
    
    // Save updated prices
    await chrome.storage.local.set({ trackedGames: games });
}

// Check prices when extension starts
chrome.runtime.onStartup.addListener(() => {
    checkAllPrices();
});

// Also check on install
chrome.runtime.onInstalled.addListener(() => {
    checkAllPrices();
});