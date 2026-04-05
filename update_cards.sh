#!/bin/bash

# Update Flesh and Blood card database from GitHub
# Downloads the latest card.json from the-fab-cube/flesh-and-blood-cards repository

CARDS_URL="https://raw.githubusercontent.com/the-fab-cube/flesh-and-blood-cards/main/json/english/card.json"
OUTPUT_FILE="./public/cards.json"
TEMP_FILE="./public/cards.json.tmp"

echo "📥 Downloading latest Flesh and Blood card database..."

# Download the file with curl
if command -v curl &> /dev/null; then
    if curl -L -f -s -o "$TEMP_FILE" "$CARDS_URL"; then
        # Check if the downloaded file is valid JSON
        if command -v jq &> /dev/null; then
            if jq empty "$TEMP_FILE" 2>/dev/null; then
                mv "$TEMP_FILE" "$OUTPUT_FILE"
                echo "✅ Card database updated successfully!"
                exit 0
            else
                echo "❌ Downloaded file is not valid JSON"
                rm -f "$TEMP_FILE"
                exit 1
            fi
        else
            # If jq is not available, just check if file is not empty
            if [ -s "$TEMP_FILE" ]; then
                mv "$TEMP_FILE" "$OUTPUT_FILE"
                echo "✅ Card database updated successfully!"
                echo "⚠️  Note: Install 'jq' for JSON validation"
                exit 0
            else
                echo "❌ Downloaded file is empty"
                rm -f "$TEMP_FILE"
                exit 1
            fi
        fi
    else
        echo "❌ Failed to download card database"
        rm -f "$TEMP_FILE"
        exit 1
    fi
else
    echo "❌ curl is not installed. Please install curl to update the card database."
    exit 1
fi