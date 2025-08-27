<script>
import { onMount } from 'svelte';
    import { select, scaleLinear, scaleTime, axisBottom, axisLeft, line, format } from 'd3';
    import VADER from 'vader-sentiment';
    import * as d3 from 'd3';

    // State variables using Svelte 5 runes
    let artistName = $state('');
    let songs = $state([]);
    let isLoading = $state(false);
    let errorMessage = $state('');
    let showChart = $state(false);

    // NOTE: This token is sensitive information and should not be hardcoded in a real application.
    // It is hardcoded here for demonstration purposes only.
    const accessToken = '_YU8djLV04fV0wqR6t8TEmpGu8_JBNnbkRoq8wlAfJ1_6jsVpAHxye1QY68LJA-Y';
    const baseUrl = 'https://api.genius.com';

    /**
     * Fetches lyrics using a Netlify serverless function proxy.
     * @param {string} url - The URL of the song page on Genius.
     * @returns {Promise<string>} - The lyrics as a string.
     */
    async function fetchLyrics(url) {
        try {
            // Call the Netlify function and pass the song URL as a query parameter
            const response = await fetch(`/.netlify/functions/fetch-lyrics?url=${encodeURIComponent(url)}`);
            if (!response.ok) {
                throw new Error('Failed to fetch lyrics via proxy.');
            }
            const data = await response.json();
            return data.lyrics || '';
        } catch (error) {
            console.error('Failed to fetch lyrics:', error);
            return '';
        }
    }

    /**
     * Draws a D3 line chart of sentiment values over time.
     * @param {Array<Object>} data - The processed song data with sentiment scores.
     */
    function drawChart(data) {
        if (!data || data.length === 0) {
            return;
        }

        const margin = { top: 20, right: 30, bottom: 40, left: 50 };
        const width = 800 - margin.left - margin.right;
        const height = 400 - margin.top - margin.bottom;

        // Clear any existing chart
        select("#sentiment-chart-container").html("");

        const svg = select("#sentiment-chart-container")
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Scales
        const x = scaleTime()
            .domain(d3.extent(data, d => d.releaseDate))
            .range([0, width]);

        const y = scaleLinear()
            .domain([-1, 1])
            .range([height, 0]);

        // Line generator
        const lineGenerator = line()
            .x(d => x(d.releaseDate))
            .y(d => y(d.sentimentCompound));

        // Add the line path
        svg.append("path")
            .datum(data)
            .attr("fill", "none")
            .attr("stroke", "steelblue")
            .attr("stroke-width", 2)
            .attr("d", lineGenerator);

        // X-axis
        svg.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(axisBottom(x).tickFormat(format("%Y")));

        // Y-axis
        svg.append("g")
            .call(axisLeft(y));
    }

    // Asynchronous function to fetch artist's songs and sentiment
    async function searchArtist() {
        if (!artistName) {
            errorMessage = 'Please enter an artist name.';
            return;
        }

        isLoading = true;
        errorMessage = '';
        songs = [];
        showChart = false;

        try {
            // Step 1: Search for the artist to get their ID
            const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(artistName)}&access_token=${accessToken}`;
            const searchResponse = await fetch(searchUrl);
            if (!searchResponse.ok) {
                throw new Error('Failed to search for artist.');
            }
            const searchData = await searchResponse.json();
            const artist = searchData.response.hits[0]?.result?.primary_artist;
            
            if (!artist) {
                errorMessage = 'Artist not found.';
                isLoading = false;
                return;
            }

            const artistId = artist.id;

            // Step 2: Get all songs by the artist
            const songsUrl = `${baseUrl}/artists/${artistId}/songs?per_page=50&access_token=${accessToken}`;
            const songsResponse = await fetch(songsUrl);
            if (!songsResponse.ok) {
                throw new Error('Failed to fetch songs for artist.');
            }
            const songsData = await songsResponse.json();

            // Filter out non-primary artist songs and those without a valid release date
            const artistSongs = songsData.response.songs.filter(
                song => song.primary_artist.id === artistId && song.release_date_for_display
            );
            
            // Use Promise.all to fetch lyrics and sentiment in parallel
            const songPromises = artistSongs.map(async song => {
                const lyrics = await fetchLyrics(song.url);
                let sentimentCompound = 0;
                if (lyrics) {
                    const sentimentResult = VADER.SentimentIntensityAnalyzer().polarity_scores(lyrics);
                    sentimentCompound = sentimentResult.compound;
                }
                
                // Construct the JSON object for the final list
                return {
                    name: song.title,
                    year: song.release_date_for_display,
                    url: song.url,
                    sentimentCompound: sentimentCompound,
                    releaseDate: new Date(song.release_date_for_display)
                };
            });

            const processedSongs = await Promise.all(songPromises);
            
            // Filter out songs with invalid dates
            const validSongs = processedSongs.filter(s => !isNaN(s.releaseDate.getTime()));

            // Sort songs by release date
            songs = validSongs.sort((a, b) => a.releaseDate - b.releaseDate);

            if (songs.length > 0) {
                drawChart(songs);
            }

        } catch (error) {
            console.error('API Error:', error);
            errorMessage = 'An error occurred while fetching data. Please try again later.';
        } finally {
            isLoading = false;
        }
    }

    // Function to handle the form submission
    function handleSubmit(event) {
        event.preventDefault();
        searchArtist();
    }
</script>

<main class="min-h-screen bg-gray-900 text-white p-8 font-sans">
    <div class="max-w-6xl mx-auto">
        <h1 class="text-4xl sm:text-5xl font-extrabold text-center mb-6 text-yellow-300">Genius Sentiment Analyzer</h1>
        <p class="text-center text-gray-400 mb-10">Search for an artist to view their songs and a sentiment analysis chart of their lyrics.</p>

        <form on:submit|preventDefault={handleSubmit} class="flex flex-col sm:flex-row gap-4 mb-12">
            <input 
                type="text" 
                placeholder="Enter artist name (e.g., Taylor Swift)"
                bind:value={artistName}
                class="flex-grow p-4 rounded-lg bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-300 transition-colors"
            />
            <button 
                type="submit"
                class="bg-yellow-300 text-gray-900 font-bold py-4 px-8 rounded-lg shadow-lg hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-300 transition-transform transform hover:scale-105"
            >
                Search
            </button>
        </form>

        {#if isLoading}
            <div class="text-center text-gray-400 text-xl flex items-center justify-center space-x-3">
                <svg class="animate-spin h-6 w-6 text-yellow-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Loading songs and analyzing sentiment...</span>
            </div>
        {:else if errorMessage}
            <div class="bg-red-500 text-white text-center p-4 rounded-lg shadow-md">
                <p>{errorMessage}</p>
            </div>
        {:else if songs.length > 0}
            <div class="flex justify-center items-center gap-4 mb-8">
                <button
                    on:click={() => showChart = false}
                    class="py-2 px-4 rounded-lg font-bold transition-colors"
                    class:bg-yellow-300={!showChart}
                    class:text-gray-900={!showChart}
                    class:bg-gray-800={showChart}
                    class:text-white={showChart}
                >
                    Song List
                </button>
                <button
                    on:click={() => showChart = true}
                    class="py-2 px-4 rounded-lg font-bold transition-colors"
                    class:bg-yellow-300={showChart}
                    class:text-gray-900={showChart}
                    class:bg-gray-800={!showChart}
                    class:text-white={!showChart}
                >
                    Sentiment Chart
                </button>
            </div>

            {#if showChart}
                <div id="sentiment-chart-container" class="bg-gray-800 rounded-xl shadow-lg p-4 mt-8 flex justify-center items-center"></div>
            {:else}
                <h2 class="text-2xl font-semibold mb-6 text-gray-200">Songs by {artistName}</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {#each songs as song}
                        <div class="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700 hover:border-yellow-300 transition-colors">
                            <h3 class="text-xl font-bold text-yellow-300">{song.name}</h3>
                            <p class="text-sm text-gray-400 mt-2">Released: {song.year}</p>
                            <p class="text-sm text-gray-400 mt-1">Sentiment (Compound): {song.sentimentCompound.toFixed(4)}</p>
                        </div>
                    {/each}
                </div>
            {/if}
        {/if}

        {#if songs.length === 0 && !isLoading && !errorMessage}
            <p class="text-center text-gray-500 text-lg mt-12">No songs to display. Try searching for an artist!</p>
        {/if}
    </div>
</main>