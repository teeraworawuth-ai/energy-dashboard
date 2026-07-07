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

        // Update Summary Cards Removed

        // Update the active charts
        updateChartsWithActiveDates();

    } catch (error) {
        console.error("Error updating charts:", error);
    }
}

// New function to fetch live status for badges and buttons
async function fetchDeviceStatus() {
    try {
        const response = await fetch('/api/status');
        const status = await response.json();
        
        ['A101', 'B101', 'C101'].forEach(room => {
            const btn = document.getElementById(`toggle-${room}`);
            const badge = document.getElementById(`badge-${room}`);
            const roomStatus = status[room];
            
            if (roomStatus && roomStatus.connected) {
                badge.className = 'badge active';
                badge.innerText = 'ออนไลน์';
                
                btn.disabled = false;
                if (roomStatus.state === true) {
                    btn.className = 'toggle-btn btn-on';
                    btn.innerText = 'เปิดอยู่ (ON)';
                } else if (roomStatus.state === false) {
                    btn.className = 'toggle-btn btn-off';
                    btn.innerText = 'ปิดอยู่ (OFF)';
                } else {
                    btn.className = 'toggle-btn';
                    btn.innerText = 'ไม่ทราบสถานะ';
                }
            } else {
                badge.className = 'badge inactive';
                badge.innerText = 'ออฟไลน์';
                btn.disabled = true;
                btn.className = 'toggle-btn';
                btn.innerText = 'ออฟไลน์';
            }
        });
    } catch (err) {
        console.error("Error fetching live status:", err);
    }
}

// Global toggle function
window.toggleDevice = async function(room) {
    const btn = document.getElementById(`toggle-${room}`);
    const currentState = btn.classList.contains('btn-on');
    const newState = !currentState;
    
    if (!newState) {
        // Turning OFF requires confirmation
        const confirmOff = confirm(`คุณแน่ใจหรือไม่ว่าต้องการ "ปิดไฟ" ห้อง ${room}?`);
        if (!confirmOff) return;
    }
    
    btn.disabled = true;
    btn.innerText = 'กำลังสั่ง...';
    
    try {
        const res = await fetch('/api/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room: room, state: newState })
        });
        const data = await res.json();
        if (!data.success) {
            alert('เกิดข้อผิดพลาด: ' + data.error);
        }
    } catch (err) {
        alert('ไม่สามารถส่งคำสั่งได้');
    }
    
    // Refresh status shortly after command
    setTimeout(fetchDeviceStatus, 1500);
};

window.resetDevice = async function(room) {
    if (!confirm(`ระบบนี้ใช้ Cloud API แล้ว ไม่จำเป็นต้องรีเซ็ตการเชื่อมต่อผ่าน Network ภายในครับ`)) return;
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    charts['A101'] = initChart('chart-A101', '#3b82f6'); // Blue
    charts['B101'] = initChart('chart-B101', '#3b82f6'); // Blue
    charts['C101'] = initChart('chart-C101', '#3b82f6'); // Blue

    renderDateButtons();
    fetchAndRenderData();
    fetchDeviceStatus();
    
    // Location Filtering Logic
    const navLinks = document.querySelectorAll('#location-nav li');
    const chartContainers = document.querySelectorAll('.chart-container');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remove active class from all links
            navLinks.forEach(nav => nav.classList.remove('active'));
            
            // Add active class to clicked link
            link.classList.add('active');
            
            const selectedLoc = link.getAttribute('data-loc');
            
            // Filter containers
            chartContainers.forEach(container => {
                if (selectedLoc === 'all') {
                    container.style.display = 'block';
                } else {
                    if (container.getAttribute('data-loc') === selectedLoc) {
                        container.style.display = 'block';
                    } else {
                        container.style.display = 'none';
                    }
                }
            });
        });
    });

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
    
    // Refresh chart data every 1 minute
    setInterval(fetchAndRenderData, 60000); 
    // Refresh live status every 5 seconds
    setInterval(fetchDeviceStatus, 5000);
    
    // Attach click events to existing small charts
    const chartInners = document.querySelectorAll('.chart-inner');
    chartInners.forEach(inner => {
        inner.addEventListener('click', (e) => {
            const parent = inner.closest('.chart-container');
            const roomMatch = parent.id.match(/container-(.+)/);
            if (roomMatch && roomMatch[1]) {
                openExpandedChart(roomMatch[1]);
            }
        });
        inner.style.cursor = 'pointer';
        inner.title = 'แตะเพื่อดูแบบขยายเต็มจอ';
    });
    
    // Close modal logic
    const modal = document.getElementById('chart-modal');
    const closeBtn = document.getElementById('modal-close');
    const canvas = document.getElementById('expanded-chart');
    
    const closeModal = () => {
        modal.style.display = 'none';
        if (expandedChartInstance) {
            expandedChartInstance.destroy();
            expandedChartInstance = null;
        }
    };
    
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    // Click on canvas to close (with simple drag prevention)
    let isDragging = false;
    canvas.addEventListener('mousedown', () => isDragging = false);
    canvas.addEventListener('mousemove', () => isDragging = true);
    canvas.addEventListener('mouseup', () => {
        if (!isDragging) closeModal();
    });
    canvas.addEventListener('touchstart', () => isDragging = false);
    canvas.addEventListener('touchmove', () => isDragging = true);
    canvas.addEventListener('touchend', () => {
        if (!isDragging) closeModal();
    });
});

// --- Expanded Chart Logic ---
let expandedChartInstance = null;

const expandedPlugin = {
    id: 'expandedPlugin',
    beforeDraw(chart) {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        
        ctx.save();
        const centerX = (chartArea.left + chartArea.right) / 2;
        const centerValue = chart.scales.x.getValueForPixel(centerX);
        
        if (centerValue !== undefined && chart.data.labels[Math.round(centerValue)]) {
            const labelStr = chart.data.labels[Math.round(centerValue)];
            const datePart = labelStr.split(' ')[1];
            
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Adjusted font size for mobile
            const fontSize = window.innerWidth < 768 ? 60 : 120;
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.fillText(`วันที่ ${datePart}`, centerX, (chartArea.top + chartArea.bottom) / 2);
        }
        ctx.restore();
    },
    afterDraw(chart) {
        const { ctx, chartArea: { bottom, left, right, top }, scales: { x, y } } = chart;
        if (!chart.data.labels || chart.data.labels.length === 0) return;
        
        ctx.save();
        
        ctx.beginPath();
        ctx.moveTo(left, bottom);
        ctx.lineTo(right, bottom);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const totalMinutes = chart.data.labels.length;
        const minIndex = Math.max(0, Math.floor(x.getValueForPixel(left)));
        const maxIndex = Math.min(totalMinutes - 1, Math.ceil(x.getValueForPixel(right)));
        
        for(let i = minIndex; i <= maxIndex; i++) { 
            const minWithinHour = i % 60;
            if (minWithinHour !== 0) continue;

            const posX = x.getPixelForValue(i);
            if(posX < left || posX > right) continue;
            
            let tickLength = 10;
            let lineWidth = 1.5;
            
            ctx.beginPath();
            ctx.moveTo(posX, bottom);
            ctx.lineTo(posX, bottom + tickLength);
            ctx.strokeStyle = `rgba(255, 255, 255, 0.8)`;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
            
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            
            const labelText = chart.data.labels[i];
            if (labelText) {
                const parts = labelText.split(' '); 
                if (parts.length >= 3) {
                    const hourStr = parseInt(parts[2].split(':')[0], 10); 
                    ctx.font = '11px sans-serif';
                    
                    // Highlight odd hours in a slightly different color or just same
                    if (hourStr % 2 !== 0) {
                        ctx.fillStyle = '#94a3b8'; // odd hours slightly dimmer
                    } else {
                        ctx.fillStyle = '#cbd5e1'; // even hours brighter
                    }
                    ctx.fillText(hourStr, posX, bottom + 12);
                }
            }
        }
        
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#94a3b8';
        
        const yMax = y.max || 10;
        const yTicks = [0, yMax/2, yMax];
        yTicks.forEach(tick => {
            const posY = y.getPixelForValue(tick);
            ctx.fillText(Math.round(tick), left - 8, posY);
        });
        
        ctx.restore();
    }
};

window.openExpandedChart = function(room) {
    const modal = document.getElementById('chart-modal');
    const title = document.getElementById('modal-title');
    modal.style.display = 'flex';
    title.innerText = `กราฟขยาย - ห้อง ${room} (เลื่อนซ้ายดูย้อนหลัง 2 วัน)`;
    
    const startDate = new Date(activeYear1, activeMonth1 - 1, activeDay1 - 2, 6, 0, 0);
    const endDate = new Date(activeYear1, activeMonth1 - 1, activeDay1 + 1, 6, 0, 0);
    
    const times = [];
    const watts = [];
    
    const dataMap = {};
    if (allFetchedData.length > 0) {
        allFetchedData.forEach(row => {
            if (row.room === room) {
                const d = parseThaiDate(row.time);
                const key = `${d.getDate()}-${d.getHours()}-${d.getMinutes()}`;
                dataMap[key] = row.watt;
            }
        });
    }

    let lastKnownWatt = null;
    let lastDataTime = null;
    const now = new Date();

    const totalMinutes = Math.floor((endDate - startDate) / 60000);
    
    for (let i = 0; i <= totalMinutes; i++) {
        const currentDate = new Date(startDate.getTime() + i * 60000);
        const d = currentDate.getDate();
        const h = currentDate.getHours();
        const m = currentDate.getMinutes();
        
        const timeLabel = `วันที่ ${d} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const key = `${d}-${h}-${m}`;
        
        times.push(timeLabel);
        
        if (currentDate > now) {
            watts.push(null);
            continue;
        }
        
        if (dataMap[key] !== undefined) {
            lastKnownWatt = dataMap[key];
            lastDataTime = currentDate;
        }
        
        if (lastDataTime && (currentDate - lastDataTime) <= 5 * 60000) {
            watts.push(lastKnownWatt);
        } else {
            watts.push(null);
        }
    }
    
    const ctx = document.getElementById('expanded-chart').getContext('2d');
    
    if (expandedChartInstance) {
        expandedChartInstance.destroy();
    }
    
    const gradient = ctx.createLinearGradient(0, 0, 0, window.innerHeight);
    gradient.addColorStop(0, '#3b82f680');
    gradient.addColorStop(1, '#3b82f600');

    expandedChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: times,
            datasets: [{
                label: 'Watt',
                data: watts,
                borderColor: '#3b82f6',
                backgroundColor: gradient,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 0, // Disable hover point to avoid closing modal when tapping
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { bottom: 40, left: 35 }
            },
            events: ['touchstart', 'touchmove', 'touchend', 'mousedown', 'mousemove', 'mouseup'], // allow events for zoom
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }, // Disable tooltip since user wants tap to close
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        modifierKey: null,
                    },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x',
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { display: false },
                    min: times.length - 1441, // Show only the last 24 hours initially
                    max: times.length - 1
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { display: false },
                    beginAtZero: true,
                    suggestedMax: 10
                }
            }
        },
        plugins: [expandedPlugin]
    });
};
