import { useState, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

interface ImportExportProps {
  deviceId: string;
  onClose: () => void;
}

interface ExportWord {
  word: string;
  translation: string;
  status: string;
  type?: string;
  reviewCount: number;
  contexts: { sentence: string; url: string }[];
  createdAt: number;
}

export function ImportExport({ deviceId, onClose }: ImportExportProps) {
  const [mode, setMode] = useState<"menu" | "export" | "import">("menu");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const allWords = useQuery(api.words.getAllForExport, { deviceId });
  const importWord = useMutation(api.words.importWord);
  
  const handleExportJSON = () => {
    if (!allWords) return;
    
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      wordCount: allWords.length,
      words: allWords.map((w) => ({
        word: w.word,
        translation: w.translation,
        status: w.status,
        type: (w as any).type ?? "word",
        reviewCount: w.reviewCount,
        contexts: w.contexts || [],
        createdAt: w.createdAt,
      })),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vocabify-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleExportCSV = () => {
    if (!allWords) return;
    
    const header = "word,translation,status,type,review_count,created_at\n";
    const rows = allWords.map((w) =>
      `"${w.word}","${w.translation.replace(/"/g, '""')}","${w.status}","${(w as any).type ?? "word"}",${w.reviewCount},${new Date(w.createdAt).toISOString()}`
    ).join("\n");
    
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vocabify-backup-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleExportAnki = () => {
    if (!allWords) return;
    
    // Anki text format: front\tback
    const rows = allWords.map((w) => `${w.word}\t${w.translation}`).join("\n");
    
    const blob = new Blob([rows], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vocabify-anki-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    setError(null);
    setImportResult(null);
    
    try {
      const text = await file.text();
      let words: ExportWord[] = [];
      
      if (file.name.endsWith(".json")) {
        const data = JSON.parse(text);
        words = data.words || [];
      } else if (file.name.endsWith(".csv")) {
        const lines = text.split("\n").slice(1); // Skip header
        words = lines.filter((l) => l.trim()).map((line) => {
          const parts = line.match(/("(?:[^"]|"")*"|[^,]*)/g) || [];
          return {
            word: parts[0]?.replace(/^"|"$/g, "").replace(/""/g, '"') || "",
            translation: parts[1]?.replace(/^"|"$/g, "").replace(/""/g, '"') || "",
            status: parts[2]?.replace(/^"|"$/g, "") || "new",
            reviewCount: parseInt(parts[3] || "0", 10),
            contexts: [],
            createdAt: Date.now(),
          };
        });
      } else if (file.name.endsWith(".txt")) {
        // Anki format: word\ttranslation
        const lines = text.split("\n");
        words = lines.filter((l) => l.includes("\t")).map((line) => {
          const [word, translation] = line.split("\t");
          return {
            word: (word || "").trim(),
            translation: (translation || "").trim(),
            status: "new" as const,
            reviewCount: 0,
            contexts: [],
            createdAt: Date.now(),
          };
        }).filter((w) => w.word && w.translation); // Filter out empty entries
      } else {
        throw new Error("Unsupported file format");
      }
      
      // Import words
      let success = 0;
      let skipped = 0;
      
      for (const w of words) {
        if (!w.word || !w.translation) {
          skipped++;
          continue;
        }
        
        try {
          const result = await importWord({
            deviceId,
            word: w.word.toLowerCase(),
            translation: w.translation,
            status: w.status as "new" | "learning" | "known",
            ...(w.type && w.type !== "word" ? { type: w.type as "word" | "phrase" | "sentence" } : {}),
          });
          
          if (result.imported) {
            success++;
          } else {
            skipped++; // Already exists
          }
        } catch {
          skipped++;
        }
      }
      
      setImportResult({ success, skipped });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === "menu" ? "Import / Export" : mode === "export" ? "Export Data" : "Import Data"}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
          >
            ✕
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4">
          {mode === "menu" && (
            <div className="space-y-3">
              <button
                onClick={() => setMode("export")}
                className="w-full p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📤</span>
                  <div>
                    <p className="font-medium text-gray-900">Export</p>
                    <p className="text-sm text-gray-500">Download your vocabulary</p>
                  </div>
                </div>
              </button>
              
              <button
                onClick={() => setMode("import")}
                className="w-full p-4 rounded-xl border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📥</span>
                  <div>
                    <p className="font-medium text-gray-900">Import</p>
                    <p className="text-sm text-gray-500">Add words from file or Anki</p>
                  </div>
                </div>
              </button>
            </div>
          )}
          
          {mode === "export" && (
            <div className="space-y-3">
              {!allWords ? (
                <div className="text-center py-6">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-sm text-gray-500 mt-2">Loading words...</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 mb-4">
                    You have <strong>{allWords.length}</strong> words to export.
                  </p>
                  
                  <button
                    onClick={handleExportJSON}
                    className="w-full p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all text-left flex items-center gap-3"
                  >
                    <span className="text-xl">📄</span>
                    <div>
                      <p className="font-medium text-gray-900">JSON (Full backup)</p>
                      <p className="text-xs text-gray-500">Complete data with contexts</p>
                    </div>
                  </button>
                  
                  <button
                    onClick={handleExportCSV}
                    className="w-full p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all text-left flex items-center gap-3"
                  >
                    <span className="text-xl">📊</span>
                    <div>
                      <p className="font-medium text-gray-900">CSV (Spreadsheet)</p>
                      <p className="text-xs text-gray-500">Open in Excel or Google Sheets</p>
                    </div>
                  </button>
                  
                  <button
                    onClick={handleExportAnki}
                    className="w-full p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all text-left flex items-center gap-3"
                  >
                    <span className="text-xl">🗃️</span>
                    <div>
                      <p className="font-medium text-gray-900">Anki (Tab-separated)</p>
                      <p className="text-xs text-gray-500">Import into Anki flashcards</p>
                    </div>
                  </button>
                </>
              )}
              
              <button
                onClick={() => setMode("menu")}
                className="w-full mt-2 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                ← Back
              </button>
            </div>
          )}
          
          {mode === "import" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Import words from a backup file, CSV, or Anki export.
              </p>
              
              <input
                type="file"
                ref={fileInputRef}
                accept=".json,.csv,.txt"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="w-full p-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-all text-center disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Importing...</p>
                  </>
                ) : (
                  <>
                    <span className="text-3xl">📁</span>
                    <p className="font-medium text-gray-900 mt-2">Choose File</p>
                    <p className="text-xs text-gray-500">.json, .csv, or .txt (Anki)</p>
                  </>
                )}
              </button>
              
              {importResult && (
                <div className="p-3 rounded-lg bg-green-50 text-green-700 text-sm">
                  ✓ Imported {importResult.success} words
                  {importResult.skipped > 0 && ` (${importResult.skipped} skipped)`}
                </div>
              )}
              
              {error && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">
                  {error}
                </div>
              )}
              
              <button
                onClick={() => setMode("menu")}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                ← Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
