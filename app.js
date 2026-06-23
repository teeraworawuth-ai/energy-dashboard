// Custom Ruler Plugin for X-axis ticks
const rulerPlugin = {
    id: 'rulerPlugin',
    afterDraw(chart) {
        const { ctx, chartArea: { bottom, left, right }, scales: { x } } = chart;
        if (!chart.data.labels || chart.data.labels.length === 0) return;
        
        ctx.save();
        
        // Draw the main bottom axis line
        ctx.beginPath();
        ctx.moveTo(left, bottom);
        ctx.lineTo(right, bottom);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const totalMinutes = chart.data.labels.length;
        
        for(let i = 0; i < totalMinutes; i++) { 
            const minWithinHour = i % 60;
            
            // Only draw ticks at minutes 00, 20, and 40
            if (minWithinHour !== 0 && minWithinHour !== 20 && minWithinHour !== 40) {
                continue;
            }

            const posX = x.getPixelForValue(i);
            if(posX < left || posX > right) continue;
            
            let tickLength = 5; // ขีดย่อย
            let lineWidth = 1;
            let opacity = 0.5;
            
            if (minWithinHour === 0) {
                tickLength = 15; // ขีดชั่วโมง (ยาวสุด)
                lineWidth = 1.5;
                opacity = 0.8;
            }

            ctx.beginPath();
            ctx.moveTo(posX, bottom);
            ctx.lineTo(posX, bottom + tickLength);
            ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
            
            // วาดตัวเลขบอกเวลาเฉพาะชั่วโมง (นาทีที่ 0) และวาดทุกๆ 2 ชั่วโมง (120 นาที) เพื่อไม่ให้รก
            if (minWithinHour === 0 && i % 120 === 0) {
                ctx.fillStyle = '#cbd5e1';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                
                const labelText = chart.data.labels[i];
                if (labelText) {
                    const parts = labelText.split(' '); // ["วันที่", "22", "04:00"]
                    if (parts.length >= 3) {
                        const timePart = parts[2]; // "04:00"
                        const hourStr = parseInt(timePart.split(':')[0], 10); // "4"
                        
                        // ถ้าเป็นเที่ยงคืน (0 นาฬิกา) ให้แสดงคำว่า "วันที่ XX" ด้วย เพื่อให้รู้ว่าขึ้นวันใหม่
                        if (hourStr === 0) {
                            ctx.font = 'bold 11px sans-serif';
                            ctx.fillStyle = '#3b82f6'; // สีฟ้าเด่นๆ สำหรับขึ้นวันใหม่
                            ctx.fillText(`${parts[0]} ${parts[1]}`, posX, bottom + 20);
                        } else {
                            // นอกนั้นแสดงแค่ตัวเลขชั่วโมง เช่น "2", "4", "6"
                            ctx.font = '11px sans-serif';
                            ctx.fillStyle = '#cbd5e1';
                            ctx.fillText(hourStr, posX, bottom + 20);
                        }
                    }
                }
            }
        }
        ctx.restore();
    }
};

// Initialize Chart configurations
const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
        padding: { bottom: 35 } // Leave space for our custom labels
    },
    plugins: {
        legend: { display: false },
        tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            callbacks: {
                label: function(context) {
                    return ` ${context.dataset.label}: ${context.raw} W`;
                }
            }
        },
        zoom: {
            pan: {
                enabled: true,
                mode: 'x',
                threshold: 20 // ป้องกันนิ้วติดกราฟเวลารูดจอขึ้นลง ต้องตั้งใจไถซ้ายขวาจริงๆ ถึงจะเลื่อนกราฟ
            },
            zoom: {
                wheel: {
                    enabled: true,
                },
                pinch: {
                    enabled: true
                },
                mode: 'x'
            }
        }
    },
    scales: {
        x: {
            grid: { display: false, drawBorder: false },
            ticks: { display: false } // We draw our own ticks and labels in rulerPlugin
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
let activeMonth1 = null;
let activeYear1 = null;

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
                borderWidth: 1.5,
                pointRadius: 0,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.1
            }]
        },
        options: commonOptions,
        plugins: [rulerPlugin]
    });
}

// Generate 8 individual dates, ending with today
function generateDateButtonsData() {
    const dates = [];
    const today = new Date();
    
    // We want 8 days ending at today
    for (let i = 7; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        
        dates.push({
            label: `${d.getDate()}`,
            day: d.getDate(),
            month: d.getMonth() + 1,
            year: d.getFullYear()
        });
    }
    return dates;
}

function renderDateButtons() {
    const dates = generateDateButtonsData();
    const container = document.getElementById('date-buttons');
    container.innerHTML = '';
    
    const defaultDate = dates[dates.length - 1];
    activeDay1 = defaultDate.day;
    activeMonth1 = defaultDate.month;
    activeYear1 = defaultDate.year;

    dates.forEach(dateInfo => {
        const btn = document.createElement('button');
        btn.className = 'date-btn';
        btn.innerText = `วันที่ ${dateInfo.label}`;
        if (dateInfo.day === activeDay1) {
            btn.classList.add('active');
        }
        
        btn.onclick = () => {
            document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeDay1 = dateInfo.day;
            activeMonth1 = dateInfo.month;
            activeYear1 = dateInfo.year;
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
    const gregorianYear = parseInt(year) > 2500 ? parseInt(year) - 543 : parseInt(year);
    return new Date(gregorianYear, parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes), parseInt(seconds));
}

function updateChartsWithActiveDates() {
    // We create exactly 1441 points (24 hours * 60 minutes) to cover 06:00 to 06:00 next day
    // start time: activeDay1 06:00:00
    const startDate = new Date(activeYear1, activeMonth1 - 1, activeDay1, 6, 0, 0);
    
    // Create mapping of 'YYYY-MM-DD HH:mm' -> watt
    const dataMap = { 'A101': {}, 'B101': {}, 'C101': {} };
    
    if (allFetchedData.length > 0) {
        allFetchedData.forEach(row => {
            const d = parseThaiDate(row.time);
            const key = `${d.getDate()}-${d.getHours()}-${d.getMinutes()}`;
            if (dataMap[row.room]) {
                dataMap[row.room][key] = row.watt;
            }
        });
    }

    const groupedData = {
        'A101': { times: [], watts: [] },
        'B101': { times: [], watts: [] },
        'C101': { times: [], watts: [] }
    };

    let lastKnownWatt = { 'A101': 0, 'B101': 0, 'C101': 0 };

    // Pad exactly 1441 points (from 06:00 to 06:00)
    for (let i = 0; i <= 1440; i++) {
        const currentDate = new Date(startDate.getTime() + i * 60000); // add i minutes
        const d = currentDate.getDate();
        const h = currentDate.getHours();
        const m = currentDate.getMinutes();
        
        const timeLabel = `วันที่ ${d} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const key = `${d}-${h}-${m}`;

        ['A101', 'B101', 'C101'].forEach(room => {
            groupedData[room].times.push(timeLabel);
            
            // If we have data for this exact minute, use it. Otherwise use last known or 0.
            if (dataMap[room][key] !== undefined) {
                lastKnownWatt[room] = dataMap[room][key];
            } else if (i === 0) {
                lastKnownWatt[room] = 0; // force start at 0 if no data
            }
            groupedData[room].watts.push(lastKnownWatt[room]);
        });
    }

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
