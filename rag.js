/**
 * ============================================================================
 * Document-Based Question Generator (RAG)
 * ============================================================================
 * 
 * Features:
 * - Content extraction from PDF, Word, Excel, PowerPoint, Markdown, HTML, TXT.
 * - Integration with the tabbed AI Generator.
 * - Multi-file support.
 * 
 * @version 1.1.0
 */

class DocumentQuestionGenerator {
  constructor(aiGenerator) {
    this.aiGenerator = aiGenerator;
    
    // DOM Elements (match new tab structure in admin.html)
    this.uploadZone = document.getElementById('uploadZone');
    this.fileInput = document.getElementById('documentFileInput');
    this.filesContainer = document.getElementById('filesContainer');
    this.uploadedFilesList = document.getElementById('uploadedFilesList');
    this.generationConfig = document.getElementById('generationConfig');
    this.extractionProgress = document.getElementById('extractionProgress');
    this.progressBar = document.getElementById('extractionProgressBar');
    this.extractedPreview = document.getElementById('extractedPreview');
    this.previewContent = document.getElementById('previewContent');
    
    // State
    this.files = [];
    this.extractedContent = '';
    this.isProcessing = false;
    
    // PDF.js Worker
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  // ============================================================================
  // INITIALIZATION & EVENT LISTENERS
  // ============================================================================
  
  setupHandlers() {
    if (this.handlersSet) return;

    // File selection
    document.getElementById('btnSelectFiles')?.addEventListener('click', () => {
      this.fileInput.click();
    });

    this.fileInput?.addEventListener('change', (e) => {
      this.handleFiles(Array.from(e.target.files));
    });

    // Drag & Drop
    this.uploadZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.uploadZone.style.borderColor = '#8b5cf6';
      this.uploadZone.style.background = '#f5f3ff';
    });

    this.uploadZone?.addEventListener('dragleave', () => {
      this.uploadZone.style.borderColor = '#cbd5e0';
      this.uploadZone.style.background = 'white';
    });

    this.uploadZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      this.uploadZone.style.borderColor = '#cbd5e0';
      this.uploadZone.style.background = 'white';
      this.handleFiles(Array.from(e.dataTransfer.files));
    });

    // Strategy Cards
    document.querySelectorAll('input[name="generationMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.querySelectorAll('.strategy-card').forEach(card => card.classList.remove('active'));
            const card = e.target.closest('label').querySelector('.strategy-card');
            if (card) card.classList.add('active');
        });
    });

    this.handlersSet = true;
  }

  // ============================================================================
  // FILE HANDLING
  // ============================================================================
  
  handleFiles(files) {
    const validFiles = files.filter(file => this.isValidFile(file));
    
    if (validFiles.length === 0) {
      if (typeof showToast === 'function') showToast('No valid files selected', 'error');
      return;
    }

    validFiles.forEach(file => {
      // Avoid duplicates
      if (this.files.some(f => f.name === file.name && f.size === file.size)) return;

      const fileData = {
        file: file,
        id: 'file_' + Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: this.formatFileSize(file.size),
        type: this.getFileType(file),
        status: 'pending',
        content: ''
      };
      
      this.files.push(fileData);
    });

    this.renderFilesList();
    if (this.uploadedFilesList) this.uploadedFilesList.style.display = 'block';
    if (this.generationConfig) this.generationConfig.style.display = 'block';
    
    // Automatically extract
    this.extractAllFiles();
  }

  isValidFile(file) {
    const validExtensions = ['.pdf', '.docx', '.xlsx', '.pptx', '.md', '.html', '.txt'];
    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    return validExtensions.includes(extension);
  }

  getFileType(file) {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const map = {
        '.pdf': { icon: '📕', color: '#ef4444' },
        '.docx': { icon: '📘', color: '#3b82f6' },
        '.xlsx': { icon: '📗', color: '#10b981' },
        '.pptx': { icon: '📙', color: '#f59e0b' },
        '.md': { icon: '📝', color: '#64748b' },
        '.html': { icon: '🌐', color: '#0ea5e9' },
        '.txt': { icon: '📄', color: '#94a3b8' }
    };
    return map[ext] || { icon: '📎', color: '#64748b' };
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  renderFilesList() {
    if (!this.filesContainer) return;
    this.filesContainer.innerHTML = this.files.map(f => `
      <div class="file-item" style="display: flex; align-items: center; gap: 12px; padding: 12px; background: white; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px;">
        <div style="font-size: 1.5rem;">${f.type.icon}</div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${f.name}</div>
          <div style="font-size: 0.75rem; color: #64748b;">${f.size} • <span class="status-text">${f.status}</span></div>
        </div>
        <button type="button" onclick="documentQuestionGenerator.removeFile('${f.id}')" style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; font-size: 1.2rem;">&times;</button>
      </div>
    `).join('');
  }

  removeFile(id) {
    this.files = this.files.filter(f => f.id !== id);
    this.renderFilesList();
    this.updateExtractedContent();
    
    if (this.files.length === 0) {
      this.uploadedFilesList.style.display = 'none';
      this.generationConfig.style.display = 'none';
      this.extractedPreview.style.display = 'none';
    }
  }

  // ============================================================================
  // CONTENT EXTRACTION
  // ============================================================================
  
  async extractAllFiles() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    if (this.extractionProgress) this.extractionProgress.style.display = 'block';
    this.updateProgress(0, 'Starting extraction...');

    for (let i = 0; i < this.files.length; i++) {
        const fileData = this.files[i];
        if (fileData.status === 'success') continue;

        try {
            fileData.status = 'extracting';
            this.renderFilesList();
            this.updateProgress((i / this.files.length) * 100, `Processing ${fileData.name}...`);
            
            fileData.content = await this.extractFileContent(fileData.file);
            fileData.status = 'success';
        } catch (err) {
            console.error('Extraction error:', err);
            fileData.status = 'error';
        }
    }

    this.isProcessing = false;
    this.updateExtractedContent();
    this.updateProgress(100, 'All files processed');
    
    setTimeout(() => {
        if (this.extractionProgress) this.extractionProgress.style.display = 'none';
    }, 1500);
  }

  updateProgress(percent, text) {
    if (this.progressBar) this.progressBar.style.width = percent + '%';
    const status = document.getElementById('extractionStatus');
    if (status) status.textContent = text;
  }

  updateExtractedContent() {
    this.extractedContent = this.files
        .filter(f => f.status === 'success')
        .map(f => `--- DOCUMENT: ${f.name} ---\n${f.content}`)
        .join('\n\n');
    
    if (this.extractedContent) {
        if (this.extractedPreview) this.extractedPreview.style.display = 'block';
        if (this.previewContent) this.previewContent.textContent = this.extractedContent.substring(0, 1000) + (this.extractedContent.length > 1000 ? '...' : '');
        
        const wordCount = this.extractedContent.split(/\s+/).length;
        document.getElementById('wordCount').textContent = wordCount + ' words';
        document.getElementById('charCount').textContent = this.extractedContent.length + ' characters';
    }
  }

  async extractFileContent(file) {
    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    switch (extension) {
      case '.pdf': return await this.extractPDF(file);
      case '.docx': return await this.extractDocx(file);
      case '.xlsx': return await this.extractXlsx(file);
      case '.pptx': return await this.extractPptx(file);
      case '.md':
      case '.html':
      case '.txt': return await this.extractPlainText(file);
      default: return '';
    }
  }

  // --- PARSERS ---

  async extractPlainText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  async extractPDF(file) {
    if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js not loaded');
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        fullText += strings.join(' ') + '\n';
    }
    
    return fullText;
  }

  async extractDocx(file) {
    if (typeof mammoth === 'undefined') throw new Error('Mammoth.js not loaded');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value;
  }

  async extractXlsx(file) {
    if (typeof XLSX === 'undefined') throw new Error('SheetJS not loaded');
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    let fullText = '';
    
    workbook.SheetNames.forEach(sheetName => {
        fullText += `[SHEET: ${sheetName}]\n`;
        const sheet = workbook.Sheets[sheetName];
        fullText += XLSX.utils.sheet_to_txt(sheet) + '\n';
    });
    
    return fullText;
  }

  async extractPptx(file) {
    if (typeof JSZip === 'undefined') {
        if (typeof loadJSZip === 'function') await loadJSZip();
        else throw new Error('JSZip not loaded');
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    let fullText = '';
    
    // PPTX slides are in ppt/slides/slideN.xml
    const slideEntries = Object.keys(zip.files).filter(f => f.startsWith('ppt/slides/slide') && f.endsWith('.xml'));
    
    // Sort slides numerically
    slideEntries.sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)[0]);
        const numB = parseInt(b.match(/\d+/)[0]);
        return numA - numB;
    });

    for (const entry of slideEntries) {
        const slideXml = await zip.file(entry).async('string');
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(slideXml, 'application/xml');
        const textNodes = xmlDoc.getElementsByTagName('a:t');
        
        let slideText = '';
        for (let i = 0; i < textNodes.length; i++) {
            slideText += textNodes[i].textContent + ' ';
        }
        fullText += `[SLIDE ${entry.match(/\d+/)[0]}]: ${slideText}\n`;
    }
    
    return fullText;
  }

  // ============================================================================
  // GENERATION
  // ============================================================================

  async requestDocumentQuestionBatch(params) {
    const prompt = this.buildPrompt(params);
    
    const response = await this.aiGenerator.executeWithRetry(async () => {
        return await this.aiGenerator.makeAPIRequest({
            messages: [
                { role: 'system', content: 'You are a quiz question generator. Always respond with valid JSON only.' },
                { role: 'user', content: prompt }
            ],
            maxTokens: this.aiGenerator.config.maxTokens
        });
    });

    if (!response) throw new Error('No response from AI provider');
    return this.aiGenerator.parseResponse(response);
  }

  async fillMissingDocumentQuestions(params, initialQuestions) {
    const requestedCount = Math.max(0, parseInt(params.count, 10) || 0);
    let questions = this.aiGenerator
        .dedupeQuestionBatch([], initialQuestions)
        .slice(0, requestedCount);
    const maxTopUpAttempts = Math.min(Math.max(requestedCount, 2), 8);

    for (
        let attempt = 1;
        questions.length < requestedCount && attempt <= maxTopUpAttempts;
        attempt++
    ) {
        const remainingParams = this.aiGenerator.getRemainingGenerationOptions(
            params,
            questions,
        );
        if (!remainingParams || remainingParams.count <= 0) break;

        remainingParams.extraInstruction = this.aiGenerator.buildTopUpInstruction(
            questions,
            remainingParams.count,
        );

        let topUpQuestions = [];
        try {
            topUpQuestions = await this.requestDocumentQuestionBatch(remainingParams);
        } catch (error) {
            if (!this.aiGenerator.isResponseParseError(error)) throw error;

            remainingParams.extraInstruction = this.aiGenerator.buildStrictTopUpInstruction(
                questions,
                remainingParams.count,
            );

            try {
                topUpQuestions = await this.requestDocumentQuestionBatch(remainingParams);
            } catch (retryError) {
                if (!this.aiGenerator.isResponseParseError(retryError)) throw retryError;
                continue;
            }
        }
        const uniqueQuestions = this.aiGenerator.dedupeQuestionBatch(
            questions,
            topUpQuestions,
        );
        if (uniqueQuestions.length === 0) continue;

        questions = questions.concat(uniqueQuestions).slice(0, requestedCount);
    }

    return questions;
  }

  async generateFromDocument(params) {
    if (!this.extractedContent || this.extractedContent.trim().length < 50) {
        throw new Error('Please select and extract files first (minimum 50 chars required)');
    }

    // Parse and process
    let questions = [];
    try {
        questions = await this.requestDocumentQuestionBatch(params);
    } catch (error) {
        if (!this.aiGenerator.isResponseParseError(error)) throw error;

        const strictParams = {
            ...params,
            extraInstruction: [
                params.extraInstruction,
                this.aiGenerator.buildStrictInitialInstruction(params),
            ].filter(Boolean).join('\n\n'),
        };
        questions = await this.requestDocumentQuestionBatch(strictParams);
    }

    if (questions.length > params.count) {
        questions = questions.slice(0, params.count);
    } else if (questions.length < params.count) {
        questions = await this.fillMissingDocumentQuestions(params, questions);
    }
    
    // Apply RAG specific overrides
    questions.forEach(q => {
        if (params.category) q.category = params.category;
        if (params.difficulty) q.difficulty = params.difficulty;
        if (params.points) q.points = parseInt(params.points);
    });

    return questions;
  }

  buildPrompt(params) {
    const {
      count,
      difficulty,
      types,
      strategy,
      typeCounts,
      codeTypeCounts = {},
      extraInstruction = ''
    } = params;
    
    // Build per-type distribution if available
    let typeDistribution = '';
    if (typeCounts && Object.keys(typeCounts).length > 0) {
      const parts = [];
      for (const [type, qty] of Object.entries(typeCounts)) {
        if (qty > 0) parts.push(`  - ${qty}x "${type}"`);
      }
      typeDistribution = `\nEXACT TYPE DISTRIBUTION (follow strictly):\n${parts.join('\n')}`;

      if (types.includes('code') && Object.keys(codeTypeCounts).length > 0) {
        const codeParts = [];
        const codeModes = ['multiple-choice', 'fill-blank', 'odd-one-out', 'draggable', 'matching-pairs'];
        for (const st of codeModes) {
            const qty = parseInt(codeTypeCounts[st], 10) || 0;
            if (qty > 0) {
                codeParts.push(`    - ${qty}x code question(s) with "type": "code" and "codeAnswerMode": "${st}"`);
            }
        }
        if (codeParts.length > 0) {
            typeDistribution += `\nCRITICAL CODE FORMAT DISTRIBUTION:\n${codeParts.join('\n')}\nFor every listed code question, the top-level "type" MUST stay exactly "code". The selected format belongs only in "codeAnswerMode". Never output "type": "undefined" or put the sub-format in "type".`;
        }
      }
    } else {
      typeDistribution = `\nSUPPORTED TYPES: ${types.join(', ')}\nDistribute ${count} questions across these types evenly.`;
    }
    
    return `CRITICAL: You MUST generate EXACTLY ${count} quiz questions. No more, no less.
    All questions MUST be at the ${difficulty.toUpperCase()} difficulty level.
    
    Based on the following document content:
    
    STRATEGY: ${strategy === 'auto' ? 'Analyze the content holistically and pick the most important information.' : 'Follow the document structure/sections and generate questions sequentially.'}
    ${typeDistribution}
    ${extraInstruction ? `\nADDITIONAL INSTRUCTION:\n${extraInstruction}\n` : ''}
    
    CONTENT:
    ${this.extractedContent}
    
    FORMAT RULES:
    1. Return a JSON array of objects.
    2. Each object MUST strictly follow this structure:
    {
      "question": "The question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "The correct option text (or comma-separated if multiple)",
      "explanation": "Brief explanation based on the document",
      "type": "multiple-choice | fill-blank | draggable | odd-one-out | matching-pairs | code",
      "isDraggable": boolean,
      "allowMultipleAnswers": boolean,
      "codeSnippet": "Optional code snippet",
      "codeLanguage": "javascript | python | etc",
      "codeAnswerMode": "multiple-choice | fill-blank | odd-one-out | draggable | matching-pairs"
    }
    
    TYPE SPECIFICS & ANSWER FORMATS:
    - Allowed top-level "type" values are ONLY: multiple-choice, fill-blank, draggable, odd-one-out, matching-pairs, code. For true-false and multiple-answer questions use "type": "multiple-choice".
    - multiple-choice: 4 options. "answer" MUST be the exact text of one option.
    - multiple-choice (multi): set "allowMultipleAnswers": true. "answer" is a comma-separated list of exact option texts.
    - true-false: type is "multiple-choice" with options ["Vrai", "Faux"]. "answer" is "Vrai" or "Faux".
    - fill-blank: use "___" for blanks. "answer" format is "1:word|2:word". "options" contains word bank.
    - matching-pairs: "answer" format is "Key1-->Value1|Key2-->Value2". "options" contains both keys and values.
    - odd-one-out: 4 options, "answer" is the extra one.
    - draggable: "answer" is correct order of "options" joined by commas. Set "isDraggable": true.
    - code: Write professional code. The top-level "type" MUST be exactly "code". "codeAnswerMode" MUST BE ONE OF: multiple-choice, fill-blank, odd-one-out, draggable, matching-pairs (as requested in the distribution). The "answer" and "options" format must match the chosen "codeAnswerMode". For codeAnswerMode fill-blank, the question text MUST contain "___".
    - If ${count} is greater than 1, create ${count} separate JSON objects. Never combine multiple questions or multiple code exercises into one object.
    
    LANGUAGE: All question content, explanations, and options MUST be in professional, academic French.
    
    IMPORTANT: Be extremely professional. Focus on critical thinking and domain-specific knowledge from the document.
    
    JSON ONLY. NO MARKDOWN BLOCK. NO EXTRA TEXT.
    STRICT JSON RULES:
    - NO trailing commas.
    - Properly escape all double quotes within strings (especially in code snippets).
    - Ensure all keys are in double quotes.
    - Response MUST be a valid JSON array starting with [ and ending with ].`;
  }
}

// Global initialization
window.initDocumentGenerator = function() {
    if (!window.aiGenerator) return;
    
    if (!window.documentQuestionGenerator) {
        window.documentQuestionGenerator = new DocumentQuestionGenerator(window.aiGenerator);
    }
    
    window.documentQuestionGenerator.setupHandlers();
};

// Auto-initialize if objects exist
if (window.aiGenerator) {
    window.initDocumentGenerator();
}
