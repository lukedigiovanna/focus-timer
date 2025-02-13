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

let timerStartTime = null;

function startTimer(categoryID) {
    console.log(categoryID);
    timerStartTime = Date.now();
    $(".category-button").attr("disabled", true);

}

function pauseTimer() {

}


