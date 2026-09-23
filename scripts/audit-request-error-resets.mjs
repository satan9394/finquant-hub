#!/usr/bin/env node

/**
 * Read-only inventory of frontend error-state clears.
 *
 * Uses the TypeScript compiler already installed by the frontend. It prints
 * syntactic clear calls plus the next async/API-looking calls in the same
 * function; it does not edit files or claim that each match is a defect.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('../frontend/node_modules/typescript');
const root = resolve('frontend/src');
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const clearSetters = /^(?:set).*?(?:error|fail|failure|haserror|errors)/i;
const asyncLookingCall = /^(?:fetch|load|request|run|create|save|delete|update|patch|post|get|put|retry|analy[sz]e|execute|simulate|calculate)/i;

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (extensions.has(entry.name.slice(entry.name.lastIndexOf('.')))) files.push(path);
  }
  return files;
}

function isFunctionLike(node) {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessor(node)
    || ts.isSetAccessor(node)
    || ts.isConstructorDeclaration(node);
}

function isClearValue(node) {
  return node.kind === ts.SyntaxKind.NullKeyword
    || (ts.isIdentifier(node) && node.text === 'undefined')
    || (node.kind === ts.SyntaxKind.FalseKeyword)
    || (ts.isStringLiteral(node) && node.text === '')
    || (ts.isArrayLiteralExpression(node) && node.elements.length === 0)
    || (ts.isObjectLiteralExpression(node) && node.properties.length === 0);
}

function callName(node) {
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) {
    const left = node.expression.expression;
    const owner = ts.isIdentifier(left) ? `${left.text}.` : '';
    return `${owner}${node.expression.name.text}`;
  }
  return '';
}

function enclosingFunction(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (!isFunctionLike(parent)) continue;
    if (parent.name && ts.isIdentifier(parent.name)) return parent.name.text;
    for (let scope = parent.parent; scope && !isFunctionLike(scope); scope = scope.parent) {
      if (ts.isVariableDeclaration(scope) && ts.isIdentifier(scope.name)) return scope.name.text;
    }
    return '<inline function>';
  }
  return '<module scope>';
}

function laterCallsInFunction(fn, position) {
  const found = [];
  function visit(node) {
    if (node !== fn.body && isFunctionLike(node)) return;
    if (ts.isCallExpression(node) && node.getStart() > position) {
      const name = callName(node);
      if (name && asyncLookingCall.test(name.split('.').at(-1))) found.push({ name, start: node.getStart() });
    }
    ts.forEachChild(node, visit);
  }
  if (fn.body) visit(fn.body);
  return found.sort((a, b) => a.start - b.start).slice(0, 3).map(({ name }) => name);
}

const records = [];
for (const path of sourceFiles(root)) {
  const text = readFileSync(path, 'utf8');
  const extension = path.slice(path.lastIndexOf('.'));
  const scriptKind = extension === '.tsx' ? ts.ScriptKind.TSX
    : extension === '.jsx' ? ts.ScriptKind.JSX
      : extension === '.js' ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && clearSetters.test(node.expression.text) && node.arguments.length > 0 && isClearValue(node.arguments[0])) {
      let fn = node.parent;
      while (fn && !isFunctionLike(fn)) fn = fn.parent;
      const nextCalls = fn ? laterCallsInFunction(fn, node.getStart()) : [];
      const location = source.getLineAndCharacterOfPosition(node.getStart());
      records.push({
        file: relative(resolve('.'), path).replaceAll('\\', '/'),
        line: location.line + 1,
        setter: node.expression.text,
        functionName: enclosingFunction(node),
        nextCalls,
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

records.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
const requestCandidates = records.filter((item) => item.nextCalls.length > 0);
const candidatesOnly = process.argv.includes('--candidates-only');
const output = candidatesOnly ? requestCandidates : records;
console.log(`# Frontend error-state reset inventory (${records.length} syntactic clears; ${requestCandidates.length} request-flow candidates)`);
console.log('Review each callsite in context; only a clear before a request in the same flow belongs to the request-start family.');
for (const item of output) {
  const flow = item.nextCalls.length ? `; following calls: ${item.nextCalls.join(', ')}` : '';
  console.log(`- ${item.file}:${item.line} — ${item.setter} in ${item.functionName}${flow}`);
}
