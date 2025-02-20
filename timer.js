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
        alert("Credentials not found!\nPlease enter them in the following prompts");
        const url = prompt("Enter SUPABASE_URL:");
        const anonKey = prompt("Enter SUPABASE_ANON_KEY:");
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

function getDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;
    return dateKey;
}

function getWeekKey(date) {

}

function getMonthKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const monthKey = `${year}-${month}`;
    return monthKey;
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
        const dateKey = getDateKey(focusTime.start_time);
        // const weekKey = getWeekKey(focusTime.start_time);
        const monthKey = getMonthKey(focusTime.start_time);

        // Add to daily summary
        if (!groups.daily[dateKey]) {
            groups.daily[dateKey] = {
                focusTimes: [],
                totalFocusTime: 0,
                totalTimeByCategory: {}
            };
        }
        groups.daily[dateKey].focusTimes.push(focusTime);
        groups.daily[dateKey].totalFocusTime += focusTime.duration;
        if (!groups.daily[dateKey].totalTimeByCategory[focusTime.category]) {
            groups.daily[dateKey].totalTimeByCategory[focusTime.category] = 0;
        }
        groups.daily[dateKey].totalTimeByCategory[focusTime.category] += focusTime.duration;

        // Add to weekly summary

        // Add to monthly summary
        if (!groups.monthly[monthKey]) {
            groups.monthly[monthKey] = {
                totalFocusTime: 0,
                totalTimeByCategory: {}
            };
        }
        groups.monthly[monthKey].totalFocusTime += focusTime.duration;
        if (!groups.monthly[monthKey].totalTimeByCategory[focusTime.category]) {
            groups.monthly[monthKey].totalTimeByCategory[focusTime.category] = 0;
        }
        groups.monthly[monthKey].totalTimeByCategory[focusTime.category] += focusTime.duration;

        return groups;
    }, {daily: {}, weekly: {}, monthly: {}});
    console.log(summary);
    return summary;
}

fetchCategories().then(() => {
    fetchAllData().then(data => {
        focusTimeData = data;
        selectDataView(1); // Load daily for the current day.
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

let dataViewId = 1;
// 1 is daily, 2 is weekly, 3 is monthly
function selectDataView(id) {
    $(`#data-view-button-${dataViewId}`).removeClass("selected");
    $(`#data-view-button-${id}`).addClass("selected");
    dataViewId = id;
    // Generate the chart
    if (dataViewId === 1) {
        const dateKey = getDateKey(new Date());
        generateCategoryBreakdown(focusTimeData.daily[dateKey]);
    }
    else if (dataViewId === 2) {
        const weekKey = getWeekKey(new Date());
        generateCategoryBreakdown(focusTimeData.weekly[weekKey]);
    }
    else if (dataViewId === 3) {
        const monthKey = getMonthKey(new Date());
        generateCategoryBreakdown(focusTimeData.monthly[monthKey]);
    }
}

// data is an object corresponding category id to focus time data
function generateCategoryBreakdown(data) {
    $("#category-data").empty();
    const keys = Object.keys(data.totalTimeByCategory).map(v => Number.parseInt(v));
    // Sort keys by duration
    keys.sort((a, b) => data.totalTimeByCategory[b] - data.totalTimeByCategory[a]);
    for (const key of keys) {
        const category = categories.get(key);
        const focusTime = data.totalTimeByCategory[key];
        const hours = Math.floor(focusTime / 60);
        const minutes = Math.floor(focusTime) % 60;
        let timeString = "";
        if (hours > 0) {
            timeString += hours;
            timeString += "h ";
        }
        timeString += minutes;
        timeString += "m";
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