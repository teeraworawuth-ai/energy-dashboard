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
            
            // Only draw ticks at minutes 00
            if (minWithinHour !== 0) {
                continue;
            }

            const posX = x.getPixelForValue(i);
            if(posX < left || posX > right) continue;
            
            let tickLength = 10; // ขีดชั่วโมง
            let lineWidth = 1.5;
            let opacity = 0.8;

            ctx.beginPath();
            ctx.moveTo(posX, bottom);
            ctx.lineTo(posX, bottom + tickLength);
            ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
            
            // วาดตัวเลขบอกเวลาเฉพาะชั่วโมงแบบคู่ (6, 8, 10, 12...)
            if (minWithinHour === 0 && i % 120 === 0) {
                ctx.fillStyle = '#cbd5e1';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                
                const labelText = chart.data.labels[i];
                if (labelText) {
                    const parts = labelText.split(' '); 
                    if (parts.length >= 3) {
                        const timePart = parts[2]; 
                        const hourStr = parseInt(timePart.split(':')[0], 10); 
                        
                        ctx.font = '9px sans-serif';
                        ctx.fillStyle = '#cbd5e1';
                        ctx.fillText(hourStr, posX, bottom + 12);
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
    events: [], // ปิดการรับส่งสัมผัสทุกชนิดบนกราฟ ทำให้กราฟกลายเป็นเหมือนรูปภาพธรรมดา เลื่อนจอผ่านได้ 100%
    plugins: {
        legend: { display: false },
        tooltip: { enabled: false } // ปิดการแสดงผลกล่องข้อความ Watt เมื่อแตะกราฟ
    },
    scales: {
        x: {
            grid: { display: false, drawBorder: false },
            ticks: { display: false } // We draw our own ticks and labels in rulerPlugin
        },
        y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { display: false }, // ซ่อน Y-axis ตัวเดิมของกราฟ
            beginAtZero: true,
            suggestedMax: 10
        }
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

    let lastKnownWatt = { 'A101': null, 'B101': null, 'C101': null };
    let lastDataTime = { 'A101': null, 'B101': null, 'C101': null };
    const now = new Date();

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
            
            // ถ้าเวลาของจุดนี้ เป็นอนาคต (เลยเวลาปัจจุบันไปแล้ว) ให้ใส่ค่า null เพื่อไม่ให้วาดเส้นกราฟ
            if (currentDate > now) {
                groupedData[room].watts.push(null);
                return;
            }
            
            // ถ้ามีข้อมูลในนาทีนี้ ให้จำค่าและจำเวลาไว้
            if (dataMap[room][key] !== undefined) {
                lastKnownWatt[room] = dataMap[room][key];
                lastDataTime[room] = currentDate;
            }
            
            // ถ้าขาดการติดต่อไปเกิน 5 นาที (ออฟไลน์) หรือยังไม่เคยมีข้อมูลเลย ให้ใส่ null (กราฟแหว่ง)
            if (lastDataTime[room] && (currentDate - lastDataTime[room]) <= 5 * 60000) {
                groupedData[room].watts.push(lastKnownWatt[room]);
            } else {
                groupedData[room].watts.push(null);
            }
        });
    }

    // Update Charts
    ['A101', 'B101', 'C101'].forEach(room => {
        if (charts[room]) {
            charts[room].data.labels = groupedData[room].times;
            charts[room].data.datasets[0].data = groupedData[room].watts;
            charts[room].update('none');

            // Set fixed custom HTML Y-axis to match chartArea exactly
            const yAxisDiv = document.getElementById(`y-axis-${room}`);
            const chartArea = charts[room].chartArea;
            if (yAxisDiv && chartArea) {
                // Position exactly alongside the chart's drawing area
                yAxisDiv.style.top = `${chartArea.top}px`;
                yAxisDiv.style.height = `${chartArea.bottom - chartArea.top}px`;
                
                // Read the actual Y scale calculated by Chart.js
                const yMax = charts[room].scales.y.max || 10;
                yAxisDiv.innerHTML = `
                    <span style="font-size: 9px; color: #94a3b8; font-weight: 600;">${Math.round(yMax)}</span>
                    <span style="font-size: 9px; color: #94a3b8; font-weight: 600;">${Math.round(yMax / 2)}</span>
                    <span style="font-size: 9px; color: #94a3b8; font-weight: 600;">0</span>
                `;
            }
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
        document.getElementById('device-status').innerHTML = `${activeDevices.size}/3 <span class="unit">Online</span>`;

        // Update Room Badges
        ['A101', 'B101', 'C101'].forEach(room => {
            const badge = document.getElementById(`badge-${room}`);
            if (badge) {
                if (activeDevices.has(room)) {
                    badge.className = 'badge active';
                    badge.innerText = 'กำลังทำงาน';
                } else {
                    badge.className = 'badge inactive';
                    badge.innerText = 'ออฟไลน์';
                }
            }
        });

        // Update the active charts
        updateChartsWithActiveDates();

    } catch (error) {
        console.error("Error updating charts:", error);
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    charts['A101'] = initChart('chart-A101', '#3b82f6'); // Blue
    charts['B101'] = initChart('chart-B101', '#3b82f6'); // Blue
    charts['C101'] = initChart('chart-C101', '#3b82f6'); // Blue

    renderDateButtons();
    fetchAndRenderData();
    
    // Set default scroll view to show 12:00 to 00:00 clearly with padding
    // Add a slight delay to ensure the browser has rendered the wide canvases
    setTimeout(() => {
        document.querySelectorAll('.chart-scroll-wrapper').forEach(wrapper => {
            if (wrapper) {
                // 22.2% of scrollWidth puts ~11:20 at the left edge
                wrapper.scrollLeft = wrapper.scrollWidth * 0.222;
            }
        });
    }, 500);
    
    // Refresh every 1 minute to match polling
    setInterval(fetchAndRenderData, 60000); 
});
