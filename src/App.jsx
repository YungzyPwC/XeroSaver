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

          if (!isValidDate(date)) return null;

          // Parse amounts, removing currency symbols and commas
          const debit = parseFloat(parseAmount(debitStr)) || 0;
          const credit = parseFloat(parseAmount(creditStr)) || 0;

          // Skip rows with no transaction amount
          if (debit === 0 && credit === 0) return null;

          // Calculate final amount (credit positive, debit negative)
          let amount;
          if (debit > 0) {
            amount = -debit; // Make debits negative
          } else if (credit > 0) {
            amount = credit; // Keep credits positive
          } else {
            return null;
          }

          return {
            Date: formatDate(date),
            Description: description,
            Amount: amount.toFixed(2) // Ensure 2 decimal places
          };
        })
        .filter(Boolean);

      if (xeroData.length === 0) {
        throw new Error('No valid transactions found in the file');
      }

      const csv = Papa.unparse(xeroData);
      downloadCSV(csv);
    } catch (error) {
      alert(error.message);
    }
  };

  const parseAmount = (value) => {
    if (!value) return '0';
    return value.toString()
      .replace(/[^0-9.-]/g, '')
      .replace(/^\./, '0.')
      .replace(/^(-?)0+(\d)/, '$1$2') || '0';
  };

  const isValidDate = (date) => {
    if (!date) return false;
    const formats = [
      new Date(date),
      new Date(date.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1')),
      new Date(date.replace(/(\d{2})-(\d{2})-(\d{4})/, '$3-$2-$1')),
    ];
    
    return formats.some(d => !isNaN(d.getTime()));
  };

  const formatDate = (date) => {
    let parsed;
    if (date.includes('/')) {
      const [day, month, year] = date.split('/');
      parsed = new Date(year, month - 1, day);
    } else if (date.includes('-')) {
      const [day, month, year] = date.split('-');
      parsed = new Date(year, month - 1, day);
    } else {
      parsed = new Date(date);
    }
    
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
