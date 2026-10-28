import { parse, format, Unit, isUnit, isConstantNode, isSymbolNode, isOperatorNode, isFunctionNode, isParenthesisNode } from 'mathjs';

const functions = new Set(['abs', 'sqrt', 'cbrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'log', 'log10', 'exp', 'round', 'floor', 'ceil', 'min', 'max']);
const operators = new Set(['+', '-', '*', '/', '^', '%', 'to', 'in']);
export type Calculation = { input: string; result: string; kind: 'math' | 'unit'; inputLabel: string; resultLabel: string };
export function calculate(input: string): Calculation | null {
  const query = input.trim();
  if (!query || query.length > 240 || /^\d+(\.\d+)?$/.test(query)) return null;
  let expression = query.replace(/[×]/g, '*').replace(/[÷]/g, '/').replace(/[−]/g, '-').replace(/\bpower\b/gi, '^').replace(/%\s+of\b/gi, '% *');
  expression = expression.replace(/^square root of (.+)$/i, 'sqrt($1)').replace(/^(.+)%\s+off\s+(.+)$/i, '($2)*(1-($1)/100)');
  try {
    const tree = parse(expression);
    let count = 0;
    tree.traverse(node => {
      if (++count > 80) throw new Error('Expression too large');
      if (isConstantNode(node) && typeof node.value === 'number' && Number.isFinite(node.value)) return;
      if (isParenthesisNode(node)) return;
      if (isOperatorNode(node) && operators.has(node.op)) return;
      if (isSymbolNode(node) && (['pi', 'e', 'tau'].includes(node.name) || functions.has(node.name) || Unit.isValuelessUnit(node.name))) return;
      if (isFunctionNode(node) && isSymbolNode(node.fn) && functions.has(node.fn.name) && node.args.length > 0 && node.args.length <= 4) return;
      throw new Error('Unsupported expression');
    });
    const value: unknown = tree.compile().evaluate();
    const unit = isUnit(value);
    if (unit ? typeof value.value !== 'number' || !Number.isFinite(value.value) : typeof value !== 'number' || !Number.isFinite(value)) return null;
    const result = format(value, { precision: 14 });
    if (result.length > 300) return null;
    return { input: query, result, kind: unit ? 'unit' : 'math', inputLabel: unit ? 'From' : 'Expression', resultLabel: unit ? 'To' : 'Result' };
  } catch { return null; }
}
