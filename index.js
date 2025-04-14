const fs = require("fs");

// --- Configuration ---
// UPDATED: Include D, E, F with desired limits
const CHAR_LIMITS = { A: 3, B: 3, C: 3, D: 3, E: 3, F: 0 }; // Example: 1 of A-E, 0 of F
const MAX_COLS = 5;
const LOG_EVERY_N_TABLES = 10000; // Adjust if needed based on expected output size
// UPDATED: Suggest changing the filename to reflect the limits
const OUTPUT_FILE = `./${CHAR_LIMITS.A}-${CHAR_LIMITS.B}-${CHAR_LIMITS.C}-${CHAR_LIMITS.D}-${CHAR_LIMITS.E}-${CHAR_LIMITS.F}.json`; // Example filename matching the limits above

// --- Stopwatch timer ---
const start = Date.now();

// --- Step 1: Generate all unique rows ---
// This function remains the same - it adapts based on the keys in the input 'counts'
function generateRowPermutations(counts) {
    const results = new Set();
    // Dynamically gets the characters from the input counts (e.g., ['A', 'B', 'C', 'D', 'E', 'F'])
    const chars = Object.keys(counts).filter(char => counts[char] > 0); // Only consider chars with limits > 0

    function helper(current, remaining) {
        // Base case: Row permutation is built (up to MAX_COLS)
        if (current.length > 0) { // Add only if the row is not empty
            // Sort characters for uniqueness regardless of internal order
            const sortedRowContent = [...current].sort();
            // Pad with nulls to reach MAX_COLS
            const paddedRow = [...sortedRowContent, ...Array(MAX_COLS - sortedRowContent.length).fill(null)];
            // Use JSON string as a key for the Set to ensure value-based uniqueness
            const key = JSON.stringify(paddedRow);
            results.add(key);
        }

        // Stop recursion if row length limit is reached
        if (current.length >= MAX_COLS) {
            return;
        }


        // Recursive step: Try adding each available character
        // Optimization: Only iterate through chars that *can* be added
        for (let char of chars) {
            if (remaining[char] > 0) {
                const newRemaining = { ...remaining };
                newRemaining[char]--;
                // Recurse with the added character
                helper([...current, char], newRemaining);
            }
        }
    }

    // Start the recursion with an empty row and the initial character counts provided
    helper([], counts);

    // Parse the JSON strings back into row arrays
    return Array.from(results).map(rowStr => JSON.parse(rowStr));
}

console.log("🔁 Generating unique rows...");
// Generate rows based on the *potential* characters and their *max per row* derived from CHAR_LIMITS
// A row can't use more characters than the total limit anyway.
const uniqueRows = generateRowPermutations(CHAR_LIMITS);
console.log(`✅ ${uniqueRows.length} unique rows generated.`);
// Optional: Log unique rows for debugging small cases
// if (Object.values(CHAR_LIMITS).reduce((s, c) => s + c, 0) < 10) { // Only log if total chars is small
//     console.log("Unique Rows:", uniqueRows);
// }

// --- Step 2: Setup for Streaming Output ---
const outputStream = fs.createWriteStream(OUTPUT_FILE);
outputStream.write("["); // Start JSON array
let isFirstTableWritten = true;
let tableCounter = 0;

// --- Step 3: Generate and Process Tables (Streaming) ---
// This function also remains the same - it adapts based on the uniqueRows and remainingCounts
function generateAndProcessTables(remainingCounts, currentTable = []) {
    // Calculate total characters remaining across all types
    const remainingTotal = Object.values(remainingCounts).reduce((sum, val) => sum + val, 0);

    // Base Case: A valid table is formed when exactly zero characters remain
    // (meaning all characters from the initial CHAR_LIMITS have been used)
    if (remainingTotal === 0) {
        tableCounter++;
        try {
            const tableString = JSON.stringify(currentTable);
            if (!isFirstTableWritten) {
                outputStream.write(","); // Add comma separator if not the first table
            }
            outputStream.write(tableString);
            isFirstTableWritten = false;
        } catch (error) {
            console.error("Error writing table to stream:", error, currentTable);
            // Handle write errors (e.g., skip, abort)
        }

        // Log progress periodically
        if (tableCounter % LOG_EVERY_N_TABLES === 0) {
            const elapsed = ((Date.now() - start) / 1000).toFixed(2);
            console.log(`🧩 Tables found: ${tableCounter} (elapsed: ${elapsed}s)`);
        }
        return; // Backtrack: This path is complete
    }

    // Optimization: If no unique rows can possibly be added, prune this branch
    let canAddAnyRow = false;
    for (const row of uniqueRows) {
         const rowCharCounts = {};
         let rowIsEmpty = true;
         for (const char of row) {
             if (char !== null) {
                 rowIsEmpty = false;
                 rowCharCounts[char] = (rowCharCounts[char] || 0) + 1;
             }
         }
         if (rowIsEmpty) continue; // Should not happen if generateRowPermutations is correct

         let rowPossible = true;
         for (const [char, count] of Object.entries(rowCharCounts)) {
             if ((remainingCounts[char] || 0) < count) {
                 rowPossible = false;
                 break;
             }
         }
         if (rowPossible) {
             canAddAnyRow = true;
             break; // Found at least one possible row to add
         }
    }
    if (!canAddAnyRow && remainingTotal > 0) {
       // console.log("Pruning branch, remaining:", remainingCounts, "table:", currentTable);
       return; // Pruning: No row can be added, but chars still remain. Invalid path.
    }


    // Recursive Step: Try adding each unique row if possible
    for (const row of uniqueRows) {
        // Calculate character counts needed for this specific row
        const rowCharCounts = {};
        let rowHasChars = false; // Ensure row isn't just [null, null, ...]
        for (const char of row) {
            if (char !== null) {
                rowCharCounts[char] = (rowCharCounts[char] || 0) + 1;
                rowHasChars = true;
            }
        }

        // This check should be redundant if uniqueRows are generated correctly
        if (!rowHasChars) continue;

        // Check if the current row can be added given the *globally* remaining character counts
        let canAddRow = true;
        const nextRemainingCounts = { ...remainingCounts };
        for (const [char, count] of Object.entries(rowCharCounts)) {
            // Ensure the character exists in limits and has enough count remaining
            if (!(char in remainingCounts) || remainingCounts[char] < count) {
                canAddRow = false;
                break;
            }
            nextRemainingCounts[char] -= count;
        }

        // If the row can be added
        if (canAddRow) {
            // Add the row to the current table structure
            currentTable.push(row);
            // Recurse with updated remaining counts and the modified table
            generateAndProcessTables(nextRemainingCounts, currentTable);
            // Backtrack: Remove the row to explore other possibilities for this level
            currentTable.pop();
        }
    }
}

// --- Run the Process ---
console.log(`🚀 Generating tables for limits: ${JSON.stringify(CHAR_LIMITS)}`);
console.log(`📝 Writing output to ${OUTPUT_FILE}...`);

// Start the recursive generation process with the initial character limits
generateAndProcessTables(CHAR_LIMITS);

// --- Finalize Output ---
outputStream.write("]"); // End the JSON array
outputStream.end(() => { // Ensure stream is fully closed before logging completion
    const totalTime = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`\n✅ Finished! Total tables found: ${tableCounter}`);
    console.log(`⏱️ Total time: ${totalTime}s`);
    console.log(`💾 Output written to ${OUTPUT_FILE}`);
});

// Handle potential stream errors during writing
outputStream.on('error', (err) => {
  console.error('Stream Write Error:', err);
});
