// file: netlify/functions/fetch-lyrics.js
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

exports.handler = async function(event, context) {
    // Get the song URL from the query parameters
    const { url } = event.queryStringParameters;

    if (!url) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing song URL' })
        };
    }

    try {
        // Fetch the Genius page
        const response = await fetch(url);
        const html = await response.text();

        // Use a DOM parser to find the lyrics div
        const dom = new JSDOM(html);
        const lyricDiv = dom.window.document.querySelector('[data-lyrics-container]');
        
        const lyrics = lyricDiv ? lyricDiv.textContent.trim() : '';

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*' // Crucial for CORS
            },
            body: JSON.stringify({ lyrics })
        };
    } catch (error) {
        console.error('Serverless function error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch lyrics' })
        };
    }
};