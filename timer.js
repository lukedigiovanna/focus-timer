// Load credentials from localStore and if they are not there prompt the 
// user for the values. These values will be saved to their localStorage
// indefinitely.

const SUPABASE_URL = "https://szurhjtdxreycknbfvon.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6dXJoanRkeHJleWNrbmJmdm9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkzMzAyNDIsImV4cCI6MjA1NDkwNjI0Mn0.lHZG9vlMdHjdM-j2v6xMvFOloG8mO3YgruIFFuTtwMM";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fetchCategories() {
    const response = await client.from("categories").select();
    const data = response.data;
    $("#categories").empty();
    for (const category of data) {
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

// null when not started and after finishing
// this value should be synced with localStorage at all times to ensure refresh
// does not affect the timer.
let currentFocusTime = null;
// { id: <row id>, category: <category object>, start_time: <date object> }

async function startTimer(categoryID) {
    console.log(categoryID);
    timerStartTime = new Date();
    console.log("Starting: ", timerStartTime.toISOString());
    const row = await client
            .from("focus_times")
            .insert({ start_time: timerStartTime, category: categoryID })
            .select();
    currentFocusTime = row.data[0];
    // convert the date string back to a date object
    currentFocusTime.start_time = new Date(currentFocusTime.start_time);
    console.log(currentFocusTime);
    $(".category-button").attr("disabled", true);
}

async function pauseTimer() {
    // Write the current time to the database for the focus time already initiated
    // Re-enable buttons to start new time
    $(".category-button").attr("disabled", false);
    currentFocusTime = null;
}

setInterval(() => {
    // Update the UI to match the time
    if (currentFocusTime === null) {
        $("#timer-text").text("00:00");
    }
    else {
        
    }
}, 100);
