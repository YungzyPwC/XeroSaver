const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      console.log('Raw CSV content:', text.substring(0, 500)); // Show more content
      
      const result = Papa.parse(text, { 
        header: false,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim()
      });
      
      // Log the first few rows to see what we're getting
      console.log('First 5 rows:', result.data.slice(0, 5));

      // Find the header row - look for rows containing key words
      let headerRowIndex = result.data.findIndex(row => 
        row.some(cell => 
          cell.toString().toLowerCase().includes('date') ||
          cell.toString().toLowerCase().includes('description') ||
          cell.toString().toLowerCase().includes('debit') ||
          cell.toString().toLowerCase().includes('credit')
        )
      );

      if (headerRowIndex === -1) {
        console.log('All rows:', result.data); // Log all rows if headers not found
        throw new Error('Could not find header row. Please check your CSV format.');
      }

      const headers = result.data[headerRowIndex].map(h => h.trim()).filter(Boolean);
      console.log('Found headers:', headers);
      setHeaders(headers);

      const possibleColumns = findPossibleColumns(headers);
      console.log('Possible column matches:', possibleColumns);

      setColumnMapping({
        headers,
        possibleColumns,
        selected: {}
      });

      setCsvContent(result.data.slice(headerRowIndex));
    } catch (error) {
      console.error('Error reading file:', error);
      console.error('Error details:', error.message);
      alert('Failed to read the file: ' + error.message);
    }
};
