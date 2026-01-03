/**
 * Prompt Input Sanitization Utilities
 *
 * These utilities help prevent prompt injection attacks by sanitizing
 * user-controlled input before embedding it in LLM prompts.
 */

/**
 * Maximum length for OCR text to prevent context overflow attacks
 */
const MAX_OCR_TEXT_LENGTH = 50000;

/**
 * Maximum length for transaction descriptions
 */
const MAX_DESCRIPTION_LENGTH = 500;

/**
 * Sanitize OCR text or document content before embedding in prompts.
 *
 * This function removes or neutralizes patterns that could be used
 * for prompt injection attacks:
 * - Markdown code blocks (could contain malicious instructions)
 * - Prompt boundary markers (===, ---, etc.)
 * - Role markers (system:, assistant:, user:)
 * - Excessive length (context overflow)
 *
 * @param text - Raw OCR text or document content
 * @returns Sanitized text safe for prompt embedding
 */
export function sanitizeOcrText(text: string): string {
  if (!text) return '';

  return (
    text
      // Remove markdown code blocks that could contain instructions
      .replace(/```[\s\S]*?```/g, '[code block removed]')
      // Remove potential prompt boundary markers
      .replace(/^===.*===$/gm, '')
      .replace(/^---.*---$/gm, '')
      .replace(/^###.*$/gm, '')
      // Neutralize potential role markers (don't remove, just neutralize)
      .replace(/\b(system|assistant|user|human|ai):/gi, '$1 -')
      // Remove potential instruction patterns
      .replace(/\b(ignore|forget|disregard)\s+(all\s+)?(previous|above|prior)\s+(instructions?|context|rules?)/gi, '[filtered]')
      .replace(/\b(you\s+are|act\s+as|pretend\s+to\s+be|from\s+now\s+on)/gi, '[filtered]')
      // Limit length to prevent context overflow
      .slice(0, MAX_OCR_TEXT_LENGTH)
      .trim()
  );
}

/**
 * Sanitize transaction description for prompt embedding.
 *
 * Transaction descriptions come from bank APIs and could contain
 * malicious content designed to manipulate categorization.
 *
 * @param description - Raw transaction description
 * @returns Sanitized description safe for prompt embedding
 */
export function sanitizeTransactionDescription(description: string): string {
  if (!description) return '';

  return (
    description
      // Escape quotes to prevent JSON injection
      .replace(/"/g, '\\"')
      // Replace newlines with spaces
      .replace(/[\n\r]/g, ' ')
      // Remove potential role markers
      .replace(/\b(system|assistant|user):/gi, '$1 -')
      // Remove potential instruction patterns
      .replace(/\b(ignore|disregard|forget)\s+(previous|above)/gi, '')
      // Collapse multiple spaces
      .replace(/\s+/g, ' ')
      // Limit length
      .slice(0, MAX_DESCRIPTION_LENGTH)
      .trim()
  );
}

/**
 * Sanitize counterparty name for prompt embedding.
 *
 * @param name - Raw counterparty name
 * @returns Sanitized name safe for prompt embedding
 */
export function sanitizeCounterpartyName(name: string | null | undefined): string {
  if (!name) return 'Not specified';

  return (
    name
      .replace(/"/g, '\\"')
      .replace(/[\n\r]/g, ' ')
      .slice(0, 200)
      .trim() || 'Not specified'
  );
}
