import React, { useState, useCallback } from 'react';
import { Upload, FileText, Copy, Check, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Fix for PDF.js worker - use CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const Index = () => {
  const [inputText, setInputText] = useState('');
  const [markdownOutput, setMarkdownOutput] = useState('');
  const [tanaOutput, setTanaOutput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [copiedTana, setCopiedTana] = useState(false);
  const { toast } = useToast();

  const convertToMarkdown = (text: string): string => {
    // Basic text to markdown conversion
    let markdown = text;
    
    // Convert line breaks to proper markdown
    markdown = markdown.replace(/\n\s*\n/g, '\n\n');
    
    // Convert URLs to markdown links
    markdown = markdown.replace(/(https?:\/\/[^\s]+)/g, '[$1]($1)');
    
    // Convert email addresses to markdown links
    markdown = markdown.replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '[$1](mailto:$1)');
    
    // Auto-detect headers (lines that are all caps or followed by === or ---)
    markdown = markdown.replace(/^([A-Z\s]+)$/gm, '# $1');
    markdown = markdown.replace(/^(.+)\n={3,}$/gm, '# $1');
    markdown = markdown.replace(/^(.+)\n-{3,}$/gm, '## $1');
    
    // Convert bullet points
    markdown = markdown.replace(/^[\s]*[•·▪▫‣⁃]\s*/gm, '- ');
    markdown = markdown.replace(/^[\s]*[\-\*\+]\s*/gm, '- ');
    
    // Convert numbered lists
    markdown = markdown.replace(/^[\s]*\d+[\.\)]\s*/gm, '1. ');
    
    return markdown.trim();
  };

  const convertToTanaPaste = (text: string): string => {
    // Convert to Tana Paste format
    let tanaContent = text;
    
    // Convert to Tana's indented structure
    const lines = tanaContent.split('\n');
    let result = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Check if it's a header
      if (line.match(/^[A-Z\s]+$/) || line.match(/^#{1,6}\s/)) {
        result += `- ${line.replace(/^#{1,6}\s/, '')}\n`;
      }
      // Check if it's already a bullet point
      else if (line.match(/^[\-\*\+•·▪▫‣⁃]\s/)) {
        result += `  - ${line.replace(/^[\-\*\+•·▪▫‣⁃]\s/, '')}\n`;
      }
      // Check if it's a numbered list
      else if (line.match(/^\d+[\.\)]\s/)) {
        result += `  - ${line.replace(/^\d+[\.\)]\s/, '')}\n`;
      }
      // Regular text becomes a node
      else {
        result += `- ${line}\n`;
      }
    }
    
    // Convert URLs to Tana format
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '[$1]($2)');
    
    return result.trim();
  };

  const processText = useCallback((text: string) => {
    setInputText(text);
    const markdown = convertToMarkdown(text);
    const tana = convertToTanaPaste(text);
    setMarkdownOutput(markdown);
    setTanaOutput(tana);
  }, []);

  const extractTextFromPDF = async (file: File): Promise<string> => {
    console.log('Starting PDF text extraction with PDF.js...');
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      console.log('PDF arrayBuffer loaded, size:', arrayBuffer.byteLength);
      
      // Try to load PDF without worker first as fallback
      const loadingTask = pdfjsLib.getDocument({ 
        data: arrayBuffer,
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true
      });
      
      const pdf = await loadingTask.promise;
      console.log('PDF loaded successfully, pages:', pdf.numPages);
      
      let fullText = '';
      
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        console.log(`Processing page ${pageNum}/${pdf.numPages}`);
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        
        fullText += pageText + '\n\n';
      }
      
      console.log('Total extracted text length:', fullText.length);
      
      if (fullText.trim().length === 0) {
        return 'No readable text found in this PDF. The PDF might contain only images or be password protected.';
      }
      
      return fullText.trim();
    } catch (error) {
      console.error('PDF text extraction error:', error);
      throw new Error(`Failed to extract text from PDF: ${error.message}`);
    }
  };

  const handleFileUpload = async (file: File) => {
    console.log('handleFileUpload called with file:', file);
    console.log('File details:', {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified
    });
    
    setIsProcessing(true);
    
    try {
      if (file.type === 'application/pdf') {
        console.log('Processing PDF file...');
        const text = await extractTextFromPDF(file);
        console.log('Extracted text length:', text.length);
        processText(text);
        toast({
          title: "PDF processed successfully",
          description: "Text extracted and converted from PDF file",
        });
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
        console.log('Processing DOCX file...');
        // Process DOCX files (Google Docs exports)
        const arrayBuffer = await file.arrayBuffer();
        console.log('DOCX arrayBuffer size:', arrayBuffer.byteLength);
        
        const result = await mammoth.extractRawText({ arrayBuffer });
        console.log('Extracted text length:', result.value.length);
        
        processText(result.value);
        toast({
          title: "Google Doc processed successfully",
          description: "Text extracted and converted from DOCX file",
        });
      } else if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        console.log('Processing text file...');
        // Process text files
        const text = await file.text();
        console.log('Text file content length:', text.length);
        processText(text);
        toast({
          title: "File processed successfully",
          description: "Text extracted and converted",
        });
      } else {
        console.log('Unsupported file type:', file.type);
        toast({
          title: "Unsupported file type",
          description: `Please upload a PDF, Google Doc (.docx), or text file. File type: ${file.type}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error processing file:', error);
      toast({
        title: "Error processing file",
        description: error.message || "There was an error reading your file",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    console.log('Drop event triggered');
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    console.log('Dropped files:', files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('File input change triggered');
    console.log('Input files:', e.target.files);
    const file = e.target.files?.[0];
    if (file) {
      console.log('File selected from input:', file.name);
      handleFileUpload(file);
    } else {
      console.log('No file selected');
    }
    // Reset the input value so the same file can be selected again
    e.target.value = '';
  };

  const handleUploadAreaClick = () => {
    console.log('Upload area clicked');
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    if (fileInput) {
      console.log('Triggering file input click');
      fileInput.click();
    } else {
      console.error('File input element not found');
    }
  };

  const copyToClipboard = async (text: string, type: 'markdown' | 'tana') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'markdown') {
        setCopiedMarkdown(true);
        setTimeout(() => setCopiedMarkdown(false), 2000);
      } else {
        setCopiedTana(true);
        setTimeout(() => setCopiedTana(false), 2000);
      }
      toast({
        title: "Copied to clipboard",
        description: `${type === 'markdown' ? 'Markdown' : 'Tana Paste'} content copied successfully`,
      });
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please try copying manually",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Text Converter</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Convert your text and documents to Markdown or Tana Paste format. Supports text input, PDF files, Google Docs, and more.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Input
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* File Upload */}
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={handleUploadAreaClick}
                >
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-600 mb-2">
                    Drop files here or click to upload
                  </p>
                  <p className="text-sm text-gray-500">
                    Supports PDF, Google Docs (.docx), TXT, MD, and other text files
                  </p>
                  <input
                    id="file-input"
                    type="file"
                    className="hidden"
                    accept=".pdf,.txt,.md,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*"
                    onChange={handleFileInputChange}
                  />
                </div>

                {/* Text Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Or paste your text here:
                  </label>
                  <Textarea
                    placeholder="Paste your text content here..."
                    value={inputText}
                    onChange={(e) => processText(e.target.value)}
                    className="min-h-[300px] resize-none"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Output Section */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Output</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="markdown" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="markdown">Markdown</TabsTrigger>
                    <TabsTrigger value="tana">Tana Paste</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="markdown" className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium">Markdown Output</h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(markdownOutput, 'markdown')}
                        disabled={!markdownOutput}
                      >
                        {copiedMarkdown ? (
                          <Check className="w-4 h-4 mr-2" />
                        ) : (
                          <Copy className="w-4 h-4 mr-2" />
                        )}
                        {copiedMarkdown ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                    <Textarea
                      value={markdownOutput}
                      readOnly
                      placeholder="Converted markdown will appear here..."
                      className="min-h-[300px] resize-none font-mono text-sm"
                    />
                  </TabsContent>
                  
                  <TabsContent value="tana" className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium">Tana Paste Output</h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(tanaOutput, 'tana')}
                        disabled={!tanaOutput}
                      >
                        {copiedTana ? (
                          <Check className="w-4 h-4 mr-2" />
                        ) : (
                          <Copy className="w-4 h-4 mr-2" />
                        )}
                        {copiedTana ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                    <Textarea
                      value={tanaOutput}
                      readOnly
                      placeholder="Converted Tana Paste format will appear here..."
                      className="min-h-[300px] resize-none font-mono text-sm"
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>

        {isProcessing && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-lg font-medium">Processing file...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
