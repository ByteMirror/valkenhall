#!/bin/bash

# Update Sorcery card database from the Sorcery TCG API
# Downloads the latest cards from https://api.sorcerytcg.com/api/cards

CARDS_URL="https://api.sorcerytcg.com/api/cards"
OUTPUT_FILE="./public/sorcery-cards.json"
TEMP_FILE="./public/sorcery-cards.json.tmp"

echo "📥 Downloading latest Sorcery card database..."

# Download the file with curl
if command -v curl &> /dev/null; then
    if curl -L -f -s -o "$TEMP_FILE" "$CARDS_URL"; then
        # Check if the downloaded file is valid JSON
        if command -v jq &> /dev/null; then
            if jq empty "$TEMP_FILE" 2>/dev/null; then
                mv "$TEMP_FILE" "$OUTPUT_FILE"
                echo "✅ Sorcery card database updated successfully!"
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
                echo "✅ Sorcery card database updated successfully!"
                echo "⚠️  Note: Install 'jq' for JSON validation"
                exit 0
            else
                echo "❌ Downloaded file is empty"
                rm -f "$TEMP_FILE"
                exit 1
            fi
        fi
    else
        echo "❌ Failed to download Sorcery card database"
        rm -f "$TEMP_FILE"
        exit 1
    fi
else
    echo "❌ curl is not installed. Please install curl to update the card database."
    exit 1
fi
