// Load credentials from localStore and if they are not there prompt the 
// user for the values. These values will be saved to their localStorage
// indefinitely.

const LS_CREDENTIALS_KEY = "focus-timer_credentials";
const LS_CURRENT_FOCUS_TIME_KEY = "focus-timer_current-focus-time";

// Tries to read credentials from localStorage
function loadCredentials() {
    let credentials = localStorage.getItem(LS_CREDENTIALS_KEY);
    if (credentials === null) {
        // Prompt for the credentials
        const key = prompt("Credentials not found!\nPlease enter your encoded DB credentials");
        const decoded = atob(key);
        const [url, anonKey] = decoded.split(";");
        credentials = { url, anonKey };
        localStorage.setItem(LS_CREDENTIALS_KEY, JSON.stringify(credentials));
    }
    else {
        credentials = JSON.parse(credentials);
    }
    return credentials;
}

const credentials = loadCredentials();
let client;
try {
    client = supabase.createClient(credentials.url, credentials.anonKey);
}
catch (e) {
    localStorage.removeItem(LS_CREDENTIALS_KEY);
    alert("Failed to load client with credentials. Cleared credentials from localStorage. Refresh and try again.");
    throw new Error("Failed to load Supabase client");
}

const categories = new Map(); // map from category ID to category object.
let focusTimeData;

function getPreviousSunday(date) {
    const copy = new Date(date.getTime());
    copy.setDate(copy.getDate() - copy.getDay());
    return copy;
}

function getDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;
    return dateKey;
}

function getWeekKey(date) {
    // Round date down to nearest Sunday
    return getDateKey(getPreviousSunday(date));
}

function getMonthKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const monthKey = `${year}-${month}`;
    return monthKey;
}

const getKey = {
    "daily": getDateKey,
    "weekly": getWeekKey,
    "monthly": getMonthKey,
};

function getTimeString(time) {
    const hours = Math.floor(time / 60);
    const minutes = Math.floor(time) % 60;
    let timeString = "";
    if (hours > 0) {
        timeString += hours;
        timeString += "h ";
    }
    if (hours === 0 || minutes > 0) {
        timeString += minutes;
        timeString += "m";
    }
    return timeString;
}

function getTimeOfDayString(date) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

async function fetchCategories() {
    const response = await client.from("categories").select();
    const data = response.data;
    $("#categories").empty();
    categories.clear();
    for (const category of data) {
        categories.set(category.id, category);
        $("#categories").append($(
            `
            <button class="category-button noto-sans" onclick="startTimer(${category.id})">
                <div class="category-button-icon" style="background-color: ${category.color}">
                </div>
                <span class="category-title" title="${category.display_name}">
                    ${category.display_name}
                </span>
            </button>
            `
        ))   
    }
}

async function fetchAllData() {
    const response = await client
            .from("focus_times")
            .select();
    const data = response.data.map(rawData => {
        const newData = {...rawData};
        newData.start_time = new Date(rawData.start_time);
        if (rawData.end_time) {
            newData.end_time = new Date(rawData.end_time);
        }
        else {
            newData.end_time = new Date(); // Use now
        }
        newData.duration = (newData.end_time - newData.start_time) / 1000 / 60;
        return newData;
    });
    // Group the data by day
    const summary = data.reduce((groups, focusTime) => {
        const addData = (groupKey, dateKey, addIndividualTimes=false) => {
            const group = groups[groupKey];
            if (!group[dateKey]) {
                group[dateKey] = {
                    totalFocusTime: 0,
                    totalTimeByCategory: {}
                };
                if (addIndividualTimes) {
                    group[dateKey].focusTimes = [];
                }
            }
            const groupData = group[dateKey];
            if (addIndividualTimes) {
                groupData.focusTimes.push(focusTime);
            }
            groupData.totalFocusTime += focusTime.duration;
            if (!groupData.totalTimeByCategory[focusTime.category]) {
                groupData.totalTimeByCategory[focusTime.category] = 0;
            }
            groupData.totalTimeByCategory[focusTime.category] += focusTime.duration;
        }

        const dateKey = getDateKey(focusTime.start_time);
        const weekKey = getWeekKey(focusTime.start_time);
        const monthKey = getMonthKey(focusTime.start_time);

        addData("daily", dateKey, true);
        addData("weekly", weekKey);
        addData("monthly", monthKey);

        return groups;
    }, {daily: {}, weekly: {}, monthly: {}});
    console.log(summary);
    return summary;
}

fetchCategories().then(() => {
    fetchAllData().then(data => {
        focusTimeData = data;
        selectDataView("daily");
    });
});

function loadCurrentFocusTimeFromLocalStorage() {
    let ft = localStorage.getItem(LS_CURRENT_FOCUS_TIME_KEY);
    if (ft) {
        ft = JSON.parse(ft);
        ft.start_time = new Date(ft.start_time);
        $("#end-timer-button").attr("disabled", false);
        return ft;
    }
    else {
        $("#end-timer-button").attr("disabled", true);
        return null;
    }
}

// null when not started and after finishing
// this value should be synced with localStorage at all times to ensure refresh
// does not affect the timer.
let currentFocusTime = loadCurrentFocusTimeFromLocalStorage();
// { id: <row id>, category: <category object>, start_time: <date object> }

async function startTimer(categoryID) {
    console.log(categoryID);
    timerStartTime = new Date();
    const response = await client
            .from("focus_times")
            .insert({ start_time: timerStartTime, category: categoryID })
            .select();
    currentFocusTime = response.data[0];
    currentFocusTime.start_time = timerStartTime;
    currentFocusTime.category = categories.get(categoryID);
    localStorage.setItem(LS_CURRENT_FOCUS_TIME_KEY, JSON.stringify(currentFocusTime));
    $("#end-timer-button").attr("disabled", false);
}

async function endTimer() {
    // Write the current time to the database for the focus time already initiated
    // Re-enable buttons to start new time
    const endTime = new Date();
    const response = await client
            .from("focus_times")
            .update({ end_time: endTime })
            .eq('id', currentFocusTime.id);
    console.log(response);
    currentFocusTime = null;
    localStorage.removeItem(LS_CURRENT_FOCUS_TIME_KEY);
    $("#end-timer-button").attr("disabled", true);
}

setInterval(() => {
    // Update the UI to match the time
    if (currentFocusTime) {
        $(".category-button").attr("disabled", true);
        // Compute the elapsed time
        const elapsed = Math.floor((new Date() - currentFocusTime.start_time) / 1000);
        // convert to MM:SS format
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        let timeString = "";
        if (minutes < 10) timeString += "0";
        timeString += minutes;
        timeString += ":";
        if (seconds < 10) timeString += "0";
        timeString += seconds;
        $("#timer-text").text(timeString);
        $("#timer-subtext").text(currentFocusTime.category.display_name);
        $("#timer-subtext").css("display", "block");
        $("#timer-subtext").css("border-color", currentFocusTime.category.color);
    }
    else {
        $(".category-button").attr("disabled", false);
    }
}, 200);

let dataViewKey = "daily";
let chartDate = new Date(); // Controls the offset of the chart view
let dataDate = new Date(); // Controls what data is viewed in the category breakdown
function selectDataView(key) {
    $(`#data-view-button-${dataViewKey}`).removeClass("selected");
    $(`#data-view-button-${key}`).addClass("selected");
    dataViewKey = key;
    chartDate = new Date();
    dataDate = new Date();
    generateDataDisplay();
}

function generateDataDisplay() {
    generateChart();
    generateCategoryBreakdown();
    generateTimeline();
}

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;
const MILLISECONDS_PER_WEEK = MILLISECONDS_PER_DAY * 7;
const DAY_ABBREVIATIONS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_ABBREVIATIONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function moveChart(delta) {
    switch (dataViewKey) {
    case "daily": // Move chart date 1 week
        chartDate = new Date(chartDate.getTime() + delta * MILLISECONDS_PER_WEEK);
        break;
    case "weekly": // Move chart date by 7 weeks
        chartDate = new Date(chartDate.getTime() + delta * MILLISECONDS_PER_WEEK * 7);
        break;
    case "monthly": // Move chart date by 7 months
        chartDate = new Date(chartDate.getTime());
        chartDate.setMonth(chartDate.getMonth() + delta * 7);
        break;
    }
    generateChart();
}

let lastTouchX;
$("#chart").on("touchstart", e => {
    lastTouchX = e.touches[0].clientX;
});
$("#chart").on("touchend", e => {
    const nowX = e.changedTouches[0].clientX;
    const diff = Math.abs(nowX - lastTouchX);
    if (diff > 20) {
        if (nowX > lastTouchX) {
            moveChart(-1);
        }
        else {
            moveChart(1);
        }
    }
});

// Generate the chart for the type of group given the given date
function generateChart() {
    let start;
    switch (dataViewKey) {
    case "daily": // Go to last sunday
        start = getPreviousSunday(chartDate);
        break;
    case "weekly": // Go seven weeks back
        start = new Date(chartDate.getTime() - 6 * MILLISECONDS_PER_WEEK);
        break;
    case "monthly": // Go seven months back
        start = new Date(chartDate.getTime());
        start.setMonth(start.getMonth() - 6);
        break;
    }
    const dates = [];
    const times = [];
    let maxTime = 0;
    for (let i = 0; i < 7; i++) {
        let date;
        switch (dataViewKey) {
        case "daily":
            date = new Date(start.getTime() + i * MILLISECONDS_PER_DAY);
            break;
        case "weekly":
            date = new Date(start.getTime() + i * MILLISECONDS_PER_WEEK);
            break;
        case "monthly":
            date = new Date(start.getTime());
            date.setMonth(date.getMonth() + i);
            break;
        }
        dates.push(date);
        const dateKey = getKey[dataViewKey](date);
        const focusTimeSummary = focusTimeData[dataViewKey][dateKey];
        const focusTime = focusTimeSummary ? focusTimeSummary.totalFocusTime : 0;
        times.push(focusTime);
        maxTime = Math.max(maxTime, focusTime);
    }
    let topTime, midTime;
    if (maxTime < 15) { topTime = 15; midTime = 7; }
    else if (maxTime < 30) { topTime = 30; midTime = 15; }
    else {
        topTime = Math.ceil(maxTime / 60) * 60;
        midTime = Math.floor(topTime / 120) * 60;
    }
    $("#chart-background #top-time").text(getTimeString(topTime));
    $("#chart-background #mid-time").text(getTimeString(midTime));
    const dataDateKey = getKey[dataViewKey](dataDate);
    $("#chart-foreground .bar").each((index, element) => {
        const h = times[index] / topTime * 160;
        element.style.height = `${h}px`;
        element.style.transform = `translateY(${180-h}px)`;
        const dateKey = getKey[dataViewKey](dates[index]);
        if (dateKey === dataDateKey) {
            element.style.backgroundColor = "#ff5c5d";
        }
        else {
            element.style.backgroundColor = "#6a393c";
        }
    });
    $("#chart-foreground .bar-column").each((index, element) => {
        element.onclick = () => {
            dataDate = dates[index];
            generateDataDisplay();
        }
    });
    $("#chart-foreground > .bar-column p").each((index, element) => {
        const date = dates[index];
        switch (dataViewKey) {
        case "daily":
            element.innerText = `${DAY_ABBREVIATIONS[date.getDay()]} ${String(date.getDate()).padStart(2, '0')}`;
            break;
        case "weekly":
            const endDate = new Date(date.getTime());
            endDate.setDate(endDate.getDate() + 6);
            element.innerText = `${date.getMonth() + 1}/${date.getDate()}-${endDate.getMonth() + 1}/${endDate.getDate()}`;
            break;
        case "monthly":
            element.innerText = `${MONTH_ABBREVIATIONS[date.getMonth()]} ${String(date.getFullYear()).substring(2)}`;
            break;
        }
    });
}

// data is an object corresponding category id to focus time data
function generateCategoryBreakdown() {
    let data = focusTimeData[dataViewKey][getKey[dataViewKey](dataDate)];
    if (!data) {
        data = {
            totalTimeByCategory: {},
            totalFocusTime: 0
        };
    }
    $("#category-data").empty();
    $("#category-data").append($(
        `
        <p id="total">Total: ${getTimeString(data.totalFocusTime)}</p>
        `
    ));

    const keys = Object.keys(data.totalTimeByCategory).map(v => Number.parseInt(v));
    // Sort keys by duration
    keys.sort((a, b) => data.totalTimeByCategory[b] - data.totalTimeByCategory[a]);
    for (const key of keys) {
        const category = categories.get(key);
        const focusTime = data.totalTimeByCategory[key];
        const timeString = getTimeString(focusTime);
        $("#category-data").append($(
            `
            <div class="category-data-row">
                <div class="category-data-icon" style="background-color: ${category.color}">
                </div>
                <div class="category-data-info">
                    <p class="category-data-title" title="${category.display_name}">
                        ${category.display_name}
                    </p>
                    <p class="category-data-focus-time">
                        ${timeString}
                    </p>
                </div>
            </button>
            `
        ))   
    }
}

function generateTimeline() {
    if (dataViewKey !== "daily") {
        $("#timeline").hide();
        return;
    }
    $("#timeline").show();
    $("#timeline #foreground").empty();
    let data = focusTimeData["daily"][getKey[dataViewKey](dataDate)];
    if (!data) {
        return;
    }
    let minimumLeft = 0;
    const offX = 27;
    const gapPerHour = 116;
    data.focusTimes.forEach((focusTime, index) => {
        const category = categories.get(focusTime.category);
        const startTime = focusTime.start_time;
        const startTimeHours = startTime.getHours() + startTime.getMinutes() / 60;
        const timeString = `${getTimeOfDayString(startTime)} to ${getTimeOfDayString(focusTime.end_time)}`;
        const width = Math.max(10, focusTime.duration / 60 * gapPerHour);
        const offset = offX + gapPerHour * startTimeHours;
        if (minimumLeft === 0 || offset < minimumLeft) {
            minimumLeft = offset;
        }
        $("#timeline #foreground").append($(
            `
                <div class="timeline-segment" 
                     title="${category.display_name} ${timeString}" 
                     style="background-color: ${category.color}; width: ${width}px; transform: translateX(${offset}px);">
                    <p class="title">
                        ${category.display_name}
                    </p>
                    <p class="time">
                        ${timeString}
                    </p>
                </div>
            `
        ))
    });
    minimumLeft = Math.max(0, minimumLeft - 100);
    $("#timeline-row").scrollLeft(minimumLeft);
}