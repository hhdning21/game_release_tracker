// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        
        // Update tab buttons
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
    });
});

// Search functionality
document.getElementById('searchBtn').addEventListener('click', searchGames);
document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchGames();
});

// Load tracked games on popup open
loadTrackedGames();

async function searchGames() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;
    
    const btn = document.getElementById('searchBtn');
    const resultsDiv = document.getElementById('searchResults');
    
    btn.disabled = true;
    btn.textContent = '⏳';
    resultsDiv.innerHTML = '<div class="loading">Searching...</div>';
    
    try {
        // Send message to background script to fetch data (bypass CORS)
        const response = await chrome.runtime.sendMessage({
            action: 'searchGames',
            query: query
        });
        
        if (response.error) {
            resultsDiv.innerHTML = `<div class="error">${response.error}</div>`;
            return;
        }
        
        if (!response.results || response.results.length === 0) {
            resultsDiv.innerHTML = '<div class="empty-state">No games found. Try a different search term.</div>';
            return;
        }
        
        displaySearchResults(response.results);
        
    } catch (err) {
        resultsDiv.innerHTML = '<div class="error">Search failed. Please try again.</div>';
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.textContent = '🔍';
    }
}

function displaySearchResults(results) {
    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.innerHTML = '';
    
    results.forEach(game => {
        const div = document.createElement('div');
        div.className = 'game-result';
        
        div.innerHTML = `
            <div class="game-title">${game.title}</div>
            <div class="game-price">${game.price}</div>
            <div class="game-details">${game.shop}</div>
            <label class="label">Alert me when price drops below:</label>
            <input type="number" class="price-input" id="target-${game.id}" placeholder="Enter target price (USD)" step="0.01" min="0">
            <button class="add-btn" data-game='${JSON.stringify(game)}'>
                📌 Track This Game
            </button>
        `;
        
        // Add click handler
        div.querySelector('.add-btn').addEventListener('click', function() {
            const gameData = JSON.parse(this.dataset.game);
            trackGame(gameData);
        });
        
        resultsDiv.appendChild(div);
    });
}

async function trackGame(game) {
    const targetInput = document.getElementById(`target-${game.id}`);
    const targetPrice = parseFloat(targetInput.value);
    
    if (!targetPrice || targetPrice <= 0) {
        alert('Please enter a valid target price!');
        return;
    }
    
    const tracked = await chrome.storage.local.get('trackedGames') || {};
    const games = tracked.trackedGames || {};
    
    games[game.id] = {
        title: game.title,
        id: game.id,
        currentPrice: game.priceValue,
        targetPrice: targetPrice,
        url: game.url,
        shop: game.shop,
        addedAt: Date.now()
    };
    
    await chrome.storage.local.set({ trackedGames: games });
    
    // Setup alarm for price checking
    chrome.alarms.create('checkPrices', { periodInMinutes: 60 });
    
    loadTrackedGames();
    document.getElementById('searchResults').innerHTML = '<div class="empty-state">✅ Game tracked successfully! Switch to tracker tab to see it.</div>';
}

async function loadTrackedGames() {
    const tracked = await chrome.storage.local.get('trackedGames') || {};
    const games = tracked.trackedGames || {};
    const gamesArray = Object.values(games);
    
    const trackedDiv = document.getElementById('trackedGames');
    const countSpan = document.getElementById('trackedCount');
    
    countSpan.textContent = gamesArray.length;
    
    if (gamesArray.length === 0) {
        trackedDiv.innerHTML = '<div class="empty-state">No games tracked yet. Search and add games above!</div>';
        return;
    }
    
    trackedDiv.innerHTML = '';
    gamesArray.forEach(game => {
        const div = document.createElement('div');
        div.className = 'tracked-item';
        div.innerHTML = `
            <div class="tracked-info">
                <div class="tracked-name">${game.title}</div>
                <div class="tracked-price">Current: $${game.currentPrice.toFixed(2)} → Target: $${game.targetPrice.toFixed(2)}</div>
            </div>
            <button class="remove-btn" data-id="${game.id}">Remove</button>
        `;
        
        div.querySelector('.remove-btn').addEventListener('click', function() {
            removeGame(this.dataset.id);
        });
        
        trackedDiv.appendChild(div);
    });
}

async function removeGame(id) {
    const tracked = await chrome.storage.local.get('trackedGames') || {};
    const games = tracked.trackedGames || {};
    
    delete games[id];
    await chrome.storage.local.set({ trackedGames: games });
    
    loadTrackedGames();
}