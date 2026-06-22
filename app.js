// Initialize Chart configurations
const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
        tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1
        }
    },
    scales: {
        x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#94a3b8', maxTicksLimit: 12 } // limit labels
        },
        y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#94a3b8' },
            beginAtZero: true
        }
    },
    interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
    }
};

let charts = {};
let allFetchedData = [];
let activeDay1 = null;
let activeDay2 = null;

function initChart(ctxId, color) {
    const ctx = document.getElementById(ctxId).getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, `${color}80`);
    gradient.addColorStop(1, `${color}00`);

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Watt',
                data: [],
                borderColor: color,
                backgroundColor: gradient,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.1
            }]
        },
        options: commonOptions
    });
}

// Generate 8 pairs of dates, ending with today-tomorrow
function generateDatePairs() {
    const pairs = [];
    const today = new Date();
    
    // We want 8 pairs ending at [today, today+1]
    for (let i = 7; i >= 0; i--) {
        const d1 = new Date(today);
        d1.setDate(today.getDate() - i);
        
        const d2 = new Date(today);
        d2.setDate(today.getDate() - i + 1);
        
        pairs.push({
            label: `${d1.getDate()}-${d2.getDate()}`,
            day1: d1.getDate(),
            day2: d2.getDate(),
            month1: d1.getMonth() + 1,
            month2: d2.getMonth() + 1
        });
    }
    return pairs;
}

function renderDateButtons() {
    const pairs = generateDatePairs();
    const container = document.getElementById('date-buttons');
    container.innerHTML = '';
    
    // Default to the last pair (today - tomorrow)
    const defaultPair = pairs[pairs.length - 1];
    activeDay1 = defaultPair.day1;
    activeDay2 = defaultPair.day2;

    pairs.forEach(pair => {
        const btn = document.createElement('button');
        btn.className = 'date-btn';
        btn.innerText = pair.label;
        if (pair.day1 === activeDay1 && pair.day2 === activeDay2) {
            btn.classList.add('active');
        }
        
        btn.onclick = () => {
            document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeDay1 = pair.day1;
            activeDay2 = pair.day2;
            updateChartsWithActiveDates();
        };
        
        container.appendChild(btn);
    });
}

// Parse string "22/6/2569 16:10:05" to JS Date
function parseThaiDate(dateStr) {
    if (!dateStr) return new Date();
    const [datePart, timePart] = dateStr.split(' ');
    const [day, month, year] = datePart.split('/');
    const [hours, minutes, seconds] = timePart.split(':');
    
    // Convert Buddhist year to Gregorian if needed (assume 25xx)
    const gregorianYear = parseInt(year) > 2500 ? parseInt(year) - 543 : parseInt(year);
    
    return new Date(gregorianYear, parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes), parseInt(seconds));
}

function updateChartsWithActiveDates() {
    if (allFetchedData.length === 0) return;

    // Filter data for the active 48-hour window
    // We only have the day number to match, which is enough for a 7-day rolling window
    const filteredData = allFetchedData.filter(row => {
        const d = parseThaiDate(row.time);
        return d.getDate() === activeDay1 || d.getDate() === activeDay2;
    });

    const groupedData = {
        'A101': { times: [], watts: [] },
        'B101': { times: [], watts: [] },
        'C101': { times: [], watts: [] }
    };

    // If a day has no data, we should pad it with 0. 
    // We will ensure at least a starting 0 and ending 0 for each day if missing.
    // For simplicity, if filteredData is completely empty, we just inject two 0s.
    ['A101', 'B101', 'C101'].forEach(room => {
        const roomData = filteredData.filter(d => d.room === room);
        
        if (roomData.length === 0) {
            // Day has no data at all -> plot 0
            groupedData[room].times = [`วันที่ ${activeDay1} 00:00`, `วันที่ ${activeDay2} 23:59`];
            groupedData[room].watts = [0, 0];
        } else {
            roomData.forEach(row => {
                const d = parseThaiDate(row.time);
                const timeLabel = `วันที่ ${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                groupedData[room].times.push(timeLabel);
                groupedData[room].watts.push(row.watt);
            });
        }
    });

    // Update Charts
    ['A101', 'B101', 'C101'].forEach(room => {
        if (charts[room]) {
            charts[room].data.labels = groupedData[room].times;
            charts[room].data.datasets[0].data = groupedData[room].watts;
            charts[room].update('none');
        }
    });
}

async function fetchAndRenderData() {
    try {
        const response = await fetch('/api/energy-data');
        const data = await response.json();
        allFetchedData = data;

        let totalWatt = 0;
        let totalAmp = 0;
        let activeDevices = new Set();

        // Get latest totals from the last occurrences globally
        ['A101', 'B101', 'C101'].forEach(room => {
            const roomData = data.filter(d => d.room === room);
            if (roomData.length > 0) {
                const latest = roomData[roomData.length - 1];
                totalWatt += latest.watt;
                totalAmp += latest.amp;
                // If it updated within the last 5 minutes, consider it online
                const latestTime = parseThaiDate(latest.time);
                const diffMins = (new Date() - latestTime) / 60000;
                if (diffMins < 5) activeDevices.add(room);
            }
        });

        // Update Summary Cards
        document.getElementById('total-watt').innerHTML = `${totalWatt.toFixed(1)} <span class="unit">W</span>`;
        document.getElementById('total-amp').innerHTML = `${totalAmp.toFixed(2)} <span class="unit">A</span>`;
        document.getElementById('device-status').innerHTML = `${activeDevices.size}/3 <span class="unit">Online</span>`;

        // Update the active charts
        updateChartsWithActiveDates();

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    charts['A101'] = initChart('chart-A101', '#3b82f6'); // Blue
    charts['B101'] = initChart('chart-B101', '#10b981'); // Green
    charts['C101'] = initChart('chart-C101', '#f59e0b'); // Yellow

    renderDateButtons();
    fetchAndRenderData();
    
    // Refresh every 1 minute to match polling
    setInterval(fetchAndRenderData, 60000); 
});
