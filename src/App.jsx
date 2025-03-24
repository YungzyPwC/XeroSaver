import React, { useRef, useState } from 'react';
import Papa from 'papaparse';

function App() {
  const fileInputRef = useRef(null);
  const [csvContent, setCsvContent] = useState(null);
  const [columnMapping, setColumnMapping] = useState(null);
  const [headers, setHeaders] = useState(null);
  const [error, setError] = useState(null);

  const columnPatterns = {
    date: [
      'effective date', 'date', 'transaction date', 'post date', 'value date',
      'processed date', 'time', 'dt', 'posting date', 'settlement date',
      'trans date', 'transaction dt', 'date posted', 'tran date', 'process date'
    ],
    description: [
      'description', 'desc', 'narrative', 'details', 'transaction details',
      'particulars', 'memo', 'notes', 'reference', 'transaction', 'payee',
      'narration', 'text', 'tran desc', 'payment details', 'name', 'merchant',
      'transaction description', 'trans desc', 'details', 'particular'
    ],
    debit: [
      'debit', 'debits', 'dr', 'withdrawal', 'withdrawals', 'payment',
      'payments', 'paid out', 'amount debit', 'debit amount', 'spend',
      'expense', 'payment out', 'withdrawl', 'debit amt', 'amount dr',
      'paid', 'withdraw', 'deductions', 'outgoing'
    ],
    credit: [
      'credit', 'credits', 'cr', 'deposit', 'deposits', 'payment in',
      'received', 'amount credit', 'credit amount', 'income', 'incoming',
      'receipt', 'payment in', 'deposit amt', 'credit amt', 'amount cr',
      'receive', 'additions', 'incoming'
    ],
    payee: [
      'payee', 'paid to', 'beneficiary', 'recipient', 'vendor', 'supplier',
      'merchant name', 'to account', 'receiver'
    ],
    reference: [
      'reference', 'ref', 'ref no', 'reference number', 'transaction ref',
      'trans ref', 'payment ref', 'remittance'
    ],
    checkNumber: [
      'check', 'cheque', 'check no', 'cheque no', 'check number', 'cheque number',
      'chq', 'chq no', 'check #', 'cheque #'
    ]
  };

  const findPossibleColumns = (headers) => {
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
    console.log('Normalized headers:', normalizedHeaders);
    
    const matches = {};
    Object.entries(columnPatterns).forEach(([type, patterns]) => {
      matches[type] = headers
        .map((header, index) => ({
          index,
          header,
          matchScore: patterns.some(pattern => 
            normalizedHeaders[index].includes(pattern) || 
            pattern.includes(normalizedHeaders[index])
          ) ? 1 : 0
        }))
        .filter(match => match.matchScore > 0);
    });

    console.log('Found matches:', matches);
    return matches;
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    try {
      const text = await file.text();
      const result = Papa.parse(text, { 
        header: false,
        skipEmptyLines: true 
      });

      let headerRowIndex = result.data.findIndex(row => {
        const rowText = row.join(' ').toLowerCase();
        return rowText.includes('debit') && rowText.includes('credit');
      });

      if (headerRowIndex === -1) {
        throw new Error('Could not find transaction headers. Please check your CSV format.');
      }

      const headers = result.data[headerRowIndex]
        .map(h => h.trim())
        .filter(h => h.length > 0);
      
      setHeaders(headers);

      const possibleColumns = findPossibleColumns(headers);

      setColumnMapping({
        headers,
        possibleColumns,
        selected: {}
      });

      setCsvContent(result.data.slice(headerRowIndex));
    } catch (error) {
      console.error('Error reading file:', error);
      setError('Failed to read the file: ' + error.message);
    }
  };

  const handleColumnSelect = (type, index) => {
    setColumnMapping(prev => ({
      ...prev,
      selected: {
        ...prev.selected,
        [type]: index
      }
    }));
  };

  const processFile = () => {
    if (!csvContent || !columnMapping) return;
    setError(null);

    try {
      const { selected } = columnMapping;

      const missingFields = [];
      if (selected.date === undefined) missingFields.push('Date');
      if (selected.debit === undefined) missingFields.push('Debit');
      if (selected.credit === undefined) missingFields.push('Credit');

      if (missingFields.length > 0) {
        throw new Error(`Please select the following required columns: ${missingFields.join(', ')}`);
      }

      const xeroData = csvContent.slice(1)
        .filter(row => row.length > Math.max(selected.date, selected.debit, selected.credit))
        .map(row => {
          const date = row[selected.date];
          const description = selected.description !== undefined ? row[selected.description] : '';
          const debitStr = row[selected.debit];
          const creditStr = row[selected.credit];
          const payee = selected.payee !== undefined ? row[selected.payee] : '';
          const reference = selected.reference !== undefined ? row[selected.reference] : '';
          const checkNumber = selected.checkNumber !== undefined ? row[selected.checkNumber] : '';

          if (!isValidDate(date)) {
            console.log('Invalid date:', date);
            return null;
          }

          const debit = parseFloat(parseAmount(debitStr)) || 0;
          const credit = parseFloat(parseAmount(creditStr)) || 0;

          if (debit === 0 && credit === 0) return null;

          let amount;
          if (debit > 0) {
            amount = -debit;
          } else if (credit > 0) {
            amount = credit;
          } else {
            return null;
          }

          try {
            return {
              "*Date": formatDate(date),
              "Description": description,
              "*Amount": amount.toFixed(2),
              "Payee": payee,
              "Reference": reference,
              "Check Number": checkNumber
            };
          } catch (error) {
            console.error('Error processing row:', error);
            return null;
          }
        })
        .filter(Boolean);

      if (xeroData.length === 0) {
        throw new Error('No valid transactions found in the file. Check if dates and amounts are present.');
      }

      const csv = Papa.unparse(xeroData);
      downloadCSV(csv);
    } catch (error) {
      console.error('Processing error:', error);
      setError(error.message);
    }
  };

  const parseAmount = (value) => {
    if (!value) return '0';
    // Handle both comma and period as decimal separators
    return value.toString()
      .replace(/[^\d,.-]/g, '')  // Remove everything except digits, dots, commas and minus
      .replace(/,/g, '.')        // Replace commas with dots
      .replace(/\.(?=.*\.)/g, '') // Remove all dots except the last one
      .replace(/^\./, '0.')      // Add leading zero to decimal numbers
      .replace(/^(-?)0+(\d)/, '$1$2') || '0'; // Remove leading zeros but keep negative sign
  };

  const isValidDate = (date) => {
    if (!date) return false;
    
    try {
      const cleanDate = date.toString().trim();
      
      // Handle month names (e.g., "31-Jul-23" or "31-July-2023")
      const monthNames = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
      };
      
      // Match "DD-MMM-YY" or "DD-MMM-YYYY"
      const monthNameRegex = /^(\d{1,2})[\-\s]([A-Za-z]{3,})[\-\s](\d{2}|\d{4})$/;
      if (monthNameRegex.test(cleanDate)) {
        const [_, day, monthStr, year] = cleanDate.match(monthNameRegex);
        const month = monthNames[monthStr.toLowerCase().substring(0, 3)];
        if (month !== undefined) {
          const fullYear = year.length === 2 ? '20' + year : year;
          const parsed = new Date(fullYear, month, day);
          return !isNaN(parsed.getTime());
        }
      }
      
      // Handle DD/MM/YYYY or DD-MM-YYYY
      if (cleanDate.includes('/') || cleanDate.includes('-')) {
        const parts = cleanDate.split(/[\/\-]/);
        if (parts.length === 3) {
          const [day, month, year] = parts;
          const fullYear = year.length === 2 ? '20' + year : year;
          const parsed = new Date(fullYear, month - 1, day);
          return !isNaN(parsed.getTime());
        }
      }
      
      // Try standard date parsing as last resort
      const parsed = new Date(cleanDate);
      return !isNaN(parsed.getTime());
    } catch (error) {
      console.log('Date validation error:', error);
      return false;
    }
  };

  const formatDate = (date) => {
    try {
      const cleanDate = date.toString().trim();
      let parsed;

      // Handle month names (e.g., "31-Jul-23" or "31-July-2023")
      const monthNames = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
      };
      
      const monthNameRegex = /^(\d{1,2})[\-\s]([A-Za-z]{3,})[\-\s](\d{2}|\d{4})$/;
      if (monthNameRegex.test(cleanDate)) {
        const [_, day, monthStr, year] = cleanDate.match(monthNameRegex);
        const month = monthNames[monthStr.toLowerCase().substring(0, 3)];
        if (month !== undefined) {
          const fullYear = year.length === 2 ? '20' + year : year;
          parsed = new Date(fullYear, month, day);
        }
      }
      // Handle DD/MM/YYYY or DD-MM-YYYY
      else if (cleanDate.includes('/') || cleanDate.includes('-')) {
        const parts = cleanDate.split(/[\/\-]/);
        if (parts.length === 3) {
          const [day, month, year] = parts;
          const fullYear = year.length === 2 ? '20' + year : year;
          parsed = new Date(fullYear, month - 1, day);
        }
      }
      // Try standard date parsing
      else {
        parsed = new Date(cleanDate);
      }
      
      if (isNaN(parsed.getTime())) {
        throw new Error('Invalid date');
      }
      
      // Format as YYYY-MM-DD
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
      
    } catch (error) {
      console.error('Date formatting error:', error, 'for date:', date);
      throw new Error(`Invalid date format: ${date}`);
    }
  };

  const downloadCSV = (csv) => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'xero-import.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '20px' }}>Bank Statement to Xero Converter</h1>
      
      <div style={{ 
        backgroundColor: '#f8f9fa',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h3 style={{ marginBottom: '10px' }}>How to Use:</h3>
        <ol style={{ 
          paddingLeft: '20px',
          margin: '0',
          lineHeight: '1.5'
        }}>
          <li>Upload your bank statement CSV file</li>
          <li>Match the columns from your statement to the required fields</li>
          <li>Click "Convert to Xero Format" to download the converted file</li>
        </ol>
        <p style={{ 
          marginTop: '10px',
          fontSize: '0.9em',
          color: '#666'
        }}>
          Note: The converter will format debits as negative amounts and credits as positive amounts in the final file.
        </p>
      </div>

      {error && (
        <div style={{
          backgroundColor: '#fee',
          color: '#c00',
          padding: '10px',
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          {error}
        </div>
      )}
      
      <div style={{ 
        border: '2px dashed #ccc', 
        padding: '40px',
        borderRadius: '8px',
        textAlign: 'center',
        marginBottom: '20px'
      }}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".csv"
          style={{ display: 'none' }}
        />
        <button 
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '10px 20px',
            backgroundColor: '#fff',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Select CSV File
        </button>
        <p style={{ marginTop: '10px', color: '#666' }}>
          Supported format: .csv
        </p>
      </div>

      {columnMapping && (
        <div style={{ 
          backgroundColor: '#f8f9fa', 
          padding: '20px', 
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <h2 style={{ marginBottom: '15px' }}>Column Mapping</h2>
          <div style={{ display: 'grid', gap: '15px' }}>
            {['date', 'description', 'debit', 'credit', 'payee', 'reference', 'checkNumber'].map(type => (
              <div key={type}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '5px',
                  fontWeight: 'bold'
                }}>
                  {type === 'checkNumber' ? 'Check Number' : type.charAt(0).toUpperCase() + type.slice(1)} Column
                  {(type === 'date' || type === 'debit' || type === 'credit') && 
                    <span style={{ color: 'red' }}> *</span>
                  }
                </label>
                <select
                  value={columnMapping.selected[type] ?? ''}
                  onChange={(e) => handleColumnSelect(type, parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '4px',
                    border: '1px solid #ccc'
                  }}
                >
                  <option value="">Select {type === 'checkNumber' ? 'check number' : type} column</option>
                  {columnMapping.headers.map((header, index) => (
                    <option 
                      key={index} 
                      value={index}
                      style={{
                        fontWeight: columnMapping.possibleColumns[type].some(m => m.index === index)
                          ? 'bold'
                          : 'normal'
                      }}
                    >
                      {header}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <button
            onClick={processFile}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              marginTop: '20px',
              cursor: 'pointer'
            }}
          >
            Convert to Xero Format
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
