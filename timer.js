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
    const response = await client.from("focus_times").select();
    return response.data;
}

fetchCategories();

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
    }
    else {
        $(".category-button").attr("disabled", false);
    }
}, 200);
