# Phase 1 Database ER Diagram

This diagram mirrors `packages/database/prisma/schema.prisma` and the Phase 1 general-ledger boundary.

```mermaid
erDiagram
  AccountSet ||--o{ AccountingPeriod : owns
  AccountSet ||--o{ ChartOfAccount : owns
  AccountSet ||--o{ Voucher : owns
  AccountSet ||--o{ Attachment : owns
  AccountSet ||--o{ PostingBatch : owns
  AccountSet ||--o{ JournalEntry : owns
  AccountSet ||--o{ AccountPeriodBalance : owns
  AccountSet ||--o{ AuditLog : records

  User ||--o{ UserRole : has
  Role ||--o{ UserRole : assigned
  Role ||--o{ RolePermission : grants
  Permission ||--o{ RolePermission : included
  AccountSet ||--o{ AccountSetUser : authorizes
  User ||--o{ AccountSetUser : enters

  ChartOfAccount ||--o{ ChartOfAccount : children
  ChartOfAccount ||--o{ AccountAuxiliaryRequirement : requires
  AuxiliaryType ||--o{ AccountAuxiliaryRequirement : required_by
  AuxiliaryType ||--o{ AuxiliaryItem : contains

  Voucher ||--o{ VoucherLine : contains
  Voucher ||--o{ VoucherStatusLog : traces
  VoucherLine ||--o{ VoucherLineAuxiliary : tags
  AuxiliaryType ||--o{ VoucherLineAuxiliary : classifies
  AuxiliaryItem ||--o{ VoucherLineAuxiliary : selected

  Voucher ||--o{ JournalEntry : posts
  VoucherLine ||--|| JournalEntry : generates
  PostingBatch ||--o{ JournalEntry : groups
  ChartOfAccount ||--o{ JournalEntry : receives
  ChartOfAccount ||--o{ AccountPeriodBalance : balances

  Attachment ||--o{ AttachmentLink : links
  Voucher ||--o{ AttachmentLink : references

  ChartOfAccount ||--o{ BankStatement : bank_account
  AccountSet ||--o{ BankReconciliation : reconciles
```

Key Phase 1 invariants:

- Voucher posting writes `PostingBatch`, `JournalEntry`, `AccountPeriodBalance`, `VoucherStatusLog`, and `AuditLog` in one transaction in the real persistence layer.
- Posted vouchers cannot be edited, voided, or have attachments deleted.
- `sourceModule`, `sourceDocumentType`, `sourceDocumentId`, and related reserved fields allow later ERP modules to generate vouchers without changing the ledger core.
