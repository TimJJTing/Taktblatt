# 2. Pagination in JavaScript

Status: accepted (2026-11-05)

## Context

Each sheet has a footer with "n / N". Firefox and Safari do not support CSS page counters in page margin boxes well. CSS fragmentation also gives different results in each browser.

## Decision

- The **paginator** measures the rendered blocks. It puts them on fixed sheets (A4 or US Letter).
- The preview shows these sheets. Print prints these sheets with `@page { margin: 0 }`.
- The paginator splits only at block borders: Gantt rows, table rows, cards, remark sections. It repeats the month header and the table header on the next sheet.

## Consequences

- The output is the same in all browsers. The preview is equal to the print.
- The paginator must measure after fonts load. It must measure again when the content changes.
- Playwright tests check the page count and the split points.
