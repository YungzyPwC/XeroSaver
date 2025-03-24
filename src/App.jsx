import React, { useRef, useState } from 'react';
import Papa from 'papaparse';

function App() {
  const fileInputRef = useRef(null);
  const [csvContent, setCsvContent] = useState(null);
  const [columnMapping, setColumnMapping] = useState(null);
  const [headers, setHeaders] = useState(null);

  const columnPatterns = {
    date: [
      'effective date', 'date', 'transaction date', 'post date', 'value date',
      'processed date', 'time', 'dt', 'posting date', 'settlement date'
    ],
    description: [
      'description', 'desc', 'narrative', 'details', 'transaction details',
      'particulars', 'memo', 'notes', 'reference', 'transaction', 'payee'
    ],
    debit: [
      'debit', 'debits', 'dr', 'withdrawal', 'withdrawals', 'payment',
      'payments', 'paid out', 'amount debit', 'debit amount', 'spend'
    ],
    credit: [
      'credit', 'credits', 'cr', 'deposit', 'deposits', 'payment in',
      'received', 'amount credit', 'credit amount', 'income'
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
            normalizedHeaders[index].includes(pattern)
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

    try {
      console.log('File selected:', file.name);
      const text = await file.text();
      console.log('File content start:', text.substring(0, 200));
      
      const result = Papa.parse(text, { 
        header: false,
        skipEmptyLines: true
      });
      
      console.log('Parsed result:', result);
      console.log('First row:', result.data[0]);
      
      const headers = result.data[0].map(h => h.trim()).filter(Boolean);
      console.log('Processed headers:', headers);

      const possibleColumns = findPossibleColumns(headers);
      console.log('Possible column matches:', possibleColumns);

      setColumnMapping({
        headers,
        possibleColumns,
        selected: {}
      });

      setCsvContent(result.data);
    } catch (error) {
      console.error('Error reading file:', error);
      console.error('Error details:', error.message);
      alert('Failed to read the file: ' + error.message);
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

    try {
      const { selected } = columnMapping;

      // Validate required columns
      const missingFields = [];
      if (selected.date === undefined || selected.date === null || selected.date === '') {
        missingFields.push('Date');
      }
      if (selected.debit === undefined || selected.debit === null || selected.debit === '') {
        missingFields.push('Debit');
      }
      if (selected.credit === undefined || selected.credit === null || selected.credit === '') {
        missingFields.push('Credit');
      }

      if (missingFields.length > 0) {
        throw new Error(`Please select the following required columns: ${missingFields.join(', ')}`);
      }

      // Convert to Xero format
      const xeroData = csvContent.slice(1)
        .filter(row => {
          if (row.length <= Math.max(selected.date, selected.debit, selected.credit)) {
            return false;
          }
          return true;
        })
        .map(row => {
          const date = row[selected.date];
          const description = selected.description !== undefined ? row[selected.description] : '';
          const debit = parseAmount(row[selected.debit]);
          const credit = parseAmount(row[selected.credit]);

          if (!isValidDate(date)) return null;
          if (!debit && !credit) return null;

          const amount = debit ? `-${debit}` : credit;

          return {
            Date: formatDate(date),
            Description: description,
            Amount: amount
          };
        })
        .filter(Boolean);

      if (xeroData.length === 0) {
        throw new Error('No valid transactions found in the file');
      }

      // Convert to CSV and download
      const csv = Papa.unparse(xeroData);
      downloadCSV(csv);
    } catch (error) {
      alert(error.message);
    }
  };

  const parseAmount = (value) => {
    if (!value) return '';
    const cleaned = value.toString().replace(/[^0-9.-]/g, '');
    return cleaned || '0';
  };

  const isValidDate = (date) => {
    if (!date) return false;
    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
  };

  const formatDate = (date) => {
    const parsed = new Date(date);
    return parsed.toISOString().split('T')[0];
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
            {['date', 'description', 'debit', 'credit'].map(type => (
              <div key={type}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '5px',
                  fontWeight: 'bold'
                }}>
                  {type.charAt(0).toUpperCase() + type.slice(1)} Column
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
                  <option value="">Select {type} column</option>
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
