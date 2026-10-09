export type IssueSeverity = 'critical' | 'warning';

export interface Issue {
  rule: 'phantom-package' | 'placeholder' | string;
  severity: IssueSeverity;
  message: string;
  file?: string;
  line?: number;
  snippet?: string;
}

export interface AnalysisResult {
  summary: {
    criticalCount: number;
    warningCount: number;
    passed: boolean;
  };
  issues: Issue[];
}
