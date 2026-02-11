/**
 * Error Line Number Mapper
 *
 * Maps error line numbers from transpiled code back to original source
 * This allows accurate error reporting to users
 *
 * Problem: When code is transpiled, line numbers shift due to:
 * - Wrapping in (function() { ... })()
 * - Console override injection
 * - p5 instance creation wrapper
 *
 * Solution: Track line offsets during transpilation and use to map stack traces
 */

/**
 * Maps source code line numbers to transpiled code line numbers
 */
export class ErrorLineMapper {
  private sourceLines: string[];
  private transpiledCode: string;
  private htmlOffset: number = 0;  // Lines added before user code in eval
  private sourceOffset: number = 0;  // Line offset in source

  /**
   * Create a new error line mapper
   *
   * @param sourceCode - The original source code (before transpilation)
   * @param transpiledCode - The transpiled code (after transformation)
   * @param injectedLinesCount - Number of lines injected before user code (console wrapper, etc.)
   *
   * @example
   * const mapper = new ErrorLineMapper(sourceCode, transpiledCode, 50);
   * const errorLine = mapper.mapErrorLine(42);  // Maps line 42 in transpiled to source
   */
  constructor(
    sourceCode: string,
    transpiledCode: string,
    injectedLinesCount: number = 0
  ) {
    this.sourceLines = sourceCode.split('\n');
    this.transpiledCode = transpiledCode;
    this.htmlOffset = injectedLinesCount;
  }

  /**
   * Map a line number from transpiled code back to source code
   *
   * @param transpiledLine - Line number in transpiled code (1-based)
   * @returns Line number in original source code (1-based)
   *
   * @example
   * mapper.mapErrorLine(125);  // Returns line in original source
   */
  mapErrorLine(transpiledLine: number): number {
    if (transpiledLine <= 0) {
      return 1;  // Clamp to valid line
    }

    // Subtract injected lines to get back to source
    const adjustedLine = transpiledLine - this.htmlOffset;

    // Clamp to source bounds
    if (adjustedLine <= 0) {
      return 1;
    }
    if (adjustedLine > this.sourceLines.length) {
      return this.sourceLines.length;
    }

    return adjustedLine;
  }

  /**
   * Extract line number from error message
   *
   * Handles various error message formats:
   * - "Error: ... at line 42"
   * - "SyntaxError: ... (line 42)"
   * - "at Object.<anonymous> (:42:10)"
   * - etc.
   *
   * @param errorMessage - The error message or stack trace
   * @returns Array of line numbers found in the error, or empty array if none
   *
   * @example
   * mapper.extractLineNumbers('SyntaxError: unexpected token (42:0)');
   * // Returns: [42]
   */
  extractLineNumbers(errorMessage: string): number[] {
    const lineNumbers: number[] = [];

    // Match various line number formats
    const patterns = [
      /line\s+(\d+)/gi,           // "at line 123"
      /\((\d+):\d+\)/g,           // "(123:0)" - position format
        /:\s*(\d+)\s*[),]/g,       // ": 123)" or ": 123,"
      /\[(\d+)\]/g,               // "[123]"
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(errorMessage)) !== null) {
        const lineNum = parseInt(match[1], 10);
        if (lineNum > 0 && !lineNumbers.includes(lineNum)) {
          lineNumbers.push(lineNum);
        }
      }
    });

    return lineNumbers;
  }

  /**
   * Map all line numbers in an error message
   *
   * @param errorMessage - The error message or stack trace
   * @returns Error message with line numbers mapped to source
   *
   * @example
   * const original = 'SyntaxError: unexpected token (125:0)';
   * mapper.mapErrorMessage(original);
   * // Returns: 'SyntaxError: unexpected token (75:0)' (if 50 lines injected)
   */
  mapErrorMessage(errorMessage: string): string {
    const lineNumbers = this.extractLineNumbers(errorMessage);

    if (lineNumbers.length === 0) {
      return errorMessage;  // No line numbers found, return as-is
    }

    let result = errorMessage;

    // Replace each line number with its mapped version
    // Sort by line number descending to avoid replacement conflicts
    lineNumbers
      .sort((a, b) => b - a)
      .forEach((lineNum) => {
        const mappedLine = this.mapErrorLine(lineNum);

        // Replace all occurrences of this line number
        // Matches various formats: (lineNum:, lineNum), line lineNum, etc.
        const patterns = [
          new RegExp(`\\(${lineNum}:`, 'g'),           // (lineNum:
          new RegExp(`line\\s+${lineNum}\\b`, 'gi'),   // line lineNum
          new RegExp(`:\\s*${lineNum}\\s*[),]`, 'g'),  // : lineNum) or : lineNum,
          new RegExp(`\\[${lineNum}\\]`, 'g'),         // [lineNum]
        ];

        patterns.forEach((pattern) => {
          result = result.replace(pattern, (match) => {
            return match.replace(String(lineNum), String(mappedLine));
          });
        });
      });

    return result;
  }

  /**
   * Get the source code line for a given line number
   *
   * @param lineNum - Line number (1-based)
   * @returns The source code line, or empty string if out of bounds
   *
   * @example
   * mapper.getSourceLine(5);  // "function setup() {"
   */
  getSourceLine(lineNum: number): string {
    const index = lineNum - 1;  // Convert to 0-based
    if (index < 0 || index >= this.sourceLines.length) {
      return '';
    }
    return this.sourceLines[index];
  }

  /**
   * Format an error with context lines
   *
   * Shows the error line plus surrounding context
   *
   * @param errorMessage - The error message
   * @param contextLines - Number of lines before/after to show (default: 2)
   * @returns Formatted error with context
   *
   * @example
   * mapper.formatErrorWithContext(errorMessage, 3);
   * // Returns formatted error with 3 lines before and after
   */
  formatErrorWithContext(errorMessage: string, contextLines: number = 2): string {
    const lineNumbers = this.extractLineNumbers(errorMessage);

    if (lineNumbers.length === 0) {
      return errorMessage;
    }

    const errorLine = Math.min(...lineNumbers);  // Use first error line
    const mappedLine = this.mapErrorLine(errorLine);

    // Collect context
    const startLine = Math.max(1, mappedLine - contextLines);
    const endLine = Math.min(this.sourceLines.length, mappedLine + contextLines);

    const context: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      const line = this.getSourceLine(i);
      const marker = i === mappedLine ? '> ' : '  ';
      context.push(`${marker}${i.toString().padStart(3, ' ')} | ${line}`);
    }

    const mappedMessage = this.mapErrorMessage(errorMessage);

    return `${mappedMessage}\n\n${context.join('\n')}`;
  }

  /**
   * Calculate HTML offset from console wrapper code
   *
   * Useful when you need to determine offset dynamically
   *
   * @param consoleWrapperCode - The console wrapper JavaScript code
   * @returns Number of lines in the wrapper code
   *
   * @example
   * const offset = ErrorLineMapper.calculateOffset(wrapperCode);
   */
  static calculateOffset(code: string): number {
    return code.split('\n').length;
  }
}

/**
 * Map error line numbers with just source and transpiled code
 *
 * Convenience function when you don't need the full mapper
 *
 * @param sourceCode - Original source code
 * @param transpiledCode - Transpiled code
 * @param errorMessage - Error message with line numbers
 * @param injectedLines - Number of injected lines (default: 0)
 * @returns Error message with mapped line numbers
 *
 * @example
 * const mapped = mapErrorLineNumbers(sourceCode, transpiledCode, errorMsg, 50);
 */
export const mapErrorLineNumbers = (
  sourceCode: string,
  transpiledCode: string,
  errorMessage: string,
  injectedLines: number = 0
): string => {
  const mapper = new ErrorLineMapper(sourceCode, transpiledCode, injectedLines);
  return mapper.mapErrorMessage(errorMessage);
};

/**
 * Extract just the mapped line number(s) from an error
 *
 * @param sourceCode - Original source code
 * @param errorMessage - Error message
 * @param injectedLines - Number of injected lines
 * @returns Array of mapped line numbers
 *
 * @example
 * const lines = extractMappedLines(source, errorMsg, 50);
 */
export const extractMappedLines = (
  sourceCode: string,
  errorMessage: string,
  injectedLines: number = 0
): number[] => {
  const mapper = new ErrorLineMapper(sourceCode, '', injectedLines);
  const transpiledLines = mapper.extractLineNumbers(errorMessage);
  return transpiledLines.map((line) => mapper.mapErrorLine(line));
};
