# VaultX --- Project Specification

**Type:** Semester project (college)\
**Nature:** Local-first, Java/Spring Boot based, no paid APIs or GPU
dependency

------------------------------------------------------------------------

## 1. Problem Statement

Traditional file-sharing platforms control access while a file remains
behind a link. Once a recipient downloads the file, the sender loses
visibility into that distributed copy.

Expiry, download limits, and revocation can prevent future platform
access, but they cannot identify which recipient's copy was later
redistributed.

For sensitive documents shared with multiple recipients, a recovered
copy normally has no direct application-level lineage connecting it to
the exact share and recipient that produced it.

------------------------------------------------------------------------

## 2. Core Idea

VaultX is a **controlled digital asset distribution and forensic
attribution platform**.

Instead of giving every recipient the exact same PDF, VaultX generates a
**recipient-specific attributed copy**.

Each distributed copy is linked to:

-   the original file,
-   the share record,
-   the recipient,
-   a unique distribution record,
-   and an HMAC-SHA256 fingerprint.

The generated PDF receives a visible dynamic watermark and VaultX
attribution metadata.

If a VaultX-generated document is later recovered, the **Leak Tracer**
extracts and verifies its fingerprint and traces the copy back to the
corresponding recipient and share.

**Core constraint:** VaultX does not claim to prevent all forwarding,
screenshots, printing, or deliberate watermark removal. It provides
controlled distribution, deterrence, lineage, and forensic attribution
--- not absolute DRM.

------------------------------------------------------------------------

## 3. High-Level Architecture

    ┌──────────────────────────────────────────────────────────┐
    │                    React Frontend                        │
    │                                                          │
    │ File Vault | Share Policies | Received Files             │
    │ Admin Dashboard | Security Dashboard | File Tags     │
    │ Distribution Lineage | Leak Tracer | Audit Timeline  │
    │ Global Audit Explorer | Integrity Verification Tool  │
    └─────────────────────────┬────────────────────────────────┘
                              │ REST / JSON / Multipart HTTP
                              ▼
    ┌──────────────────────────────────────────────────────────┐
    │                  Spring Boot Backend                     │
    │                                                          │
    │  Spring Security + JWT                                   │
    │  File Vault + Integrity Engine                           │
    │  Share + Access Policy Engine                            │
    │  Distribution + Fingerprint Engine                       │
    │  PDF Watermark Engine                                    │
    │  Leak Trace + Audit Engine                               │
    │  Secure Share Links + Email Notifications              │
    └───────────────┬──────────────────────────┬───────────────┘
                    │                          │
                    ▼                          ▼
           ┌─────────────────┐       ┌──────────────────────┐
           │   PostgreSQL    │       │ Secure Local Storage │
           │                 │       │                      │
           │ Users           │       │ Original PDF Files   │
           │ Files           │       │ UUID-Based Names     │
           │ Shares          │       │                      │
           │ Distribution    │       └──────────────────────┘
           │ Audit Events    │
           └─────────────────┘

    Distribution Pipeline:

    Original PDF
         ↓
    Access Policy Validation
         ↓
    HMAC Fingerprint Generation
         ↓
    PDFBox Watermark + Metadata
         ↓
    Distribution Copy Record
         ↓
    Recipient Download

------------------------------------------------------------------------

## 4. Component-by-Component Breakdown

### 4.1 Authentication and Security

VaultX uses Spring Security and JWT authentication.

    Email + Password
            ↓
    AuthenticationManager
            ↓
    BCrypt Verification
            ↓
    JWT Access Token

A custom JWT filter validates protected requests and resolves the
authenticated user.

The security layer handles:

-   registration and login,
-   BCrypt password hashing,
-   JWT generation and validation,
-   protected APIs,
-   role-based authorization,
-   file ownership validation,
-   recipient validation,
-   failed-access logging.

Authorization is always enforced by the backend. Frontend visibility is
not treated as a security control.

------------------------------------------------------------------------

### 4.2 File Vault and Integrity Engine

VaultX accepts PDF files through Spring `MultipartFile`.

    PDF Upload
        ↓
    File Validation
        ↓
    UUID Storage Name
        ↓
    SHA-256 Hash
        ↓
    Secure Filesystem Storage
        ↓
    Metadata Persistence

The original filename is stored as metadata. The physical file uses a
server-generated UUID name.

Every original file receives a SHA-256 integrity hash using Java
`MessageDigest`.

Before distribution:

    Stored File
        ↓
    Recalculate SHA-256
        ↓
    Compare with Original Hash
        ↓
    VERIFIED / FAILED

An integrity failure blocks distribution and creates an audit event.

**MVP scope:** PDF only.

------------------------------------------------------------------------

### 4.3 Share and Access Policy Engine

The owner shares a file with another registered VaultX user.

A share can define:

-   expiry time,
-   download limit,
-   preview permission,
-   dynamic attribution,
-   revocation status.

Possible share states:

    ACTIVE
    EXPIRED
    REVOKED
    LIMIT_REACHED

All access rules are evaluated by a dedicated Access Policy Engine.

    Download Request
           ↓
    Authenticated?
           ↓
    Correct Recipient?
           ↓
    Share Active?
           ↓
    Not Revoked?
           ↓
    Not Expired?
           ↓
    Download Limit Available?
           ↓
    File Integrity Valid?
           ↓
    ACCESS GRANTED

The engine returns a structured decision such as:

``` json
{
  "allowed": false,
  "reason": "DOWNLOAD_LIMIT_REACHED"
}
```

This creates one testable source of truth for access decisions.

------------------------------------------------------------------------

### 4.4 Recipient-Specific Fingerprinting and Watermarking

When an authorized recipient downloads a PDF, VaultX does not directly
return the original file.

A recipient-specific distribution identity is generated using:

    file_id
    share_id
    recipient_id

Canonical payload:

    FILE:17|SHARE:91|RECIPIENT:42

VaultX calculates:

    HMAC-SHA256(
        server_secret,
        canonical_payload
    )

Example fingerprint:

    VX-91BC72A8F...

HMAC is used instead of a plain hash because the fingerprint depends on
a server-held secret.

Apache PDFBox then generates an attributed PDF.

Example watermark:

    CONFIDENTIAL • dhruv@example.com • VX-81DE7

VaultX also inserts attribution metadata such as:

    VaultX-Copy-ID
    VaultX-Fingerprint
    VaultX-Share-ID

The visible watermark acts as a deterrence layer. The signed fingerprint
metadata provides machine-readable attribution.

------------------------------------------------------------------------

### 4.5 Distribution Lineage

Every attributed copy is stored as a `DistributionCopy`.

    VaultFile
        ↓
    Share
        ↓
    DistributionCopy
        ↓
    Fingerprint

Example:

                      REPORT.PDF
                          │
               ┌──────────┼──────────┐
               │          │          │
            AARAV       JIGAR      DHRUV
               │          │          │
            VX-71A      VX-92B     VX-81D
               │          │          │
            ACTIVE      EXPIRED    REVOKED

The frontend uses React Flow to visualize this distribution lineage.

The graph is generated from relational data stored in PostgreSQL. A
graph database is not required for the MVP.

------------------------------------------------------------------------

### 4.6 Leak Tracer

The Leak Tracer accepts a suspected PDF and attempts to identify its
VaultX distribution origin.

    Suspected PDF
          ↓
    PDFBox Metadata Extraction
          ↓
    Fingerprint Extraction
          ↓
    Distribution Lookup
          ↓
    HMAC Verification
          ↓
    Trace Result

Possible results:

    DIRECT_MATCH
    INVALID_ATTRIBUTION
    NO_VAULTX_FINGERPRINT

A direct match returns:

-   original file,
-   recipient,
-   share record,
-   distribution copy,
-   generation time,
-   download time,
-   current share status.

Example:

    SOURCE COPY IDENTIFIED

    Original Asset:
    Confidential Report.pdf

    Distributed To:
    Dhruv Patel

    Copy:
    VX-81DE7

    Downloaded:
    14 July 2026, 14:42

    Share Status:
    REVOKED

The result is deterministic. VaultX does not use fake AI confidence
percentages.

------------------------------------------------------------------------

### 4.7 Audit and Activity Timeline

Security-relevant actions generate audit events.

Examples:

    LOGIN_FAILED
    FILE_UPLOADED
    INTEGRITY_FAILED
    SHARE_CREATED
    SHARE_REVOKED
    DOWNLOAD_GRANTED
    DOWNLOAD_DENIED
    DISTRIBUTION_COPY_GENERATED
    LEAK_TRACE_PERFORMED
    FINGERPRINT_MATCHED

Each event records:

-   actor,
-   event type,
-   resource,
-   timestamp,
-   IP address,
-   event metadata.

The frontend displays these events as an activity timeline.

The MVP audit log is an application audit trail, not a blockchain or
tamper-proof ledger.

------------------------------------------------------------------------

### 4.8 Secure Share Links

In addition to recipient-to-recipient sharing, VaultX can generate
secure share links.

Each link supports:

-   expiry time,
-   optional password protection,
-   download limits,
-   one-time download,
-   revocation.

Each generated link is associated with a share record and audited like
any other distribution event.

------------------------------------------------------------------------

### 4.9 Email Notifications

VaultX sends email notifications for important actions such as:

-   file shared,
-   share revoked,
-   share expired,
-   download completed.

The MVP uses standard SMTP (JavaMail) without relying on paid services.

------------------------------------------------------------------------

### 4.10 Admin Dashboard

Administrators have a centralized dashboard displaying:

-   total users,
-   total files,
-   active shares,
-   downloads,
-   revoked shares,
-   leak trace operations,
-   recent activity.

------------------------------------------------------------------------

### 4.11 Security Dashboard

A security-focused dashboard summarizes:

-   integrity verification results,
-   failed login attempts,
-   denied downloads,
-   revoked shares,
-   audit statistics,
-   traced leak count.

------------------------------------------------------------------------

### 4.12 Global Audit Explorer

Beyond the timeline, VaultX provides searchable audit exploration.

Filters include:

-   user,
-   event type,
-   file,
-   recipient,
-   date range.

------------------------------------------------------------------------

### 4.13 Integrity Verification Tool

An uploaded PDF can be checked independently of the sharing workflow.

The tool:

    Uploaded PDF
         ↓
    SHA-256 Verification
         ↓
    Fingerprint Validation
         ↓
    Metadata Validation
         ↓
    VERIFIED / FAILED

------------------------------------------------------------------------

### 4.14 File Tags

Files may be assigned searchable tags such as:

-   Confidential
-   HR
-   Finance
-   Legal
-   Personal

Tags improve organization and filtering without affecting attribution.

------------------------------------------------------------------------

## 5. Tech Stack Summary

  Layer                   Choice
  ----------------------- -----------------------------
  Frontend                React + Vite
  Styling                 Tailwind CSS
  Lineage Visualization   React Flow
  Backend                 Java 25 + Spring Boot
  REST API                Spring Web
  Security                Spring Security
  Authentication          JWT with JJWT
  Password Hashing        BCrypt
  ORM                     Spring Data JPA + Hibernate
  Database                PostgreSQL
  Migrations              Flyway
  PDF Processing          Apache PDFBox
  File Storage            Java NIO + Local Filesystem
  Integrity               SHA-256 via `MessageDigest`
  Fingerprinting          HMAC-SHA256 via `Mac`
  Validation              Jakarta Bean Validation
  Email J                 avaMail (SMTP)
  I Documentation Sp      ringdoc OpenAPI / Swagger
  Testing                 JUnit 5 + Mockito + Postman
  Build                   Maven
  Version Control         Git + GitHub

No AI model is required in the core VaultX pipeline. Attribution is
deterministic, local, reproducible, and explainable.

------------------------------------------------------------------------

## 6. Exact MVP Scope

The mandatory MVP contains:

1.  User registration and JWT login.
2.  PDF upload and secure local storage.
3.  SHA-256 integrity verification.
4.  File listing and details.
5.  User-to-user file sharing.
6.  Expiry and download limits.
7.  Share revocation.
8.  Access Policy Engine.
9.  HMAC-SHA256 distribution fingerprinting.
10. Dynamic PDF watermarking.
11. Distribution-copy tracking.
12. Leak Tracer.
13. Distribution lineage graph.
14. Audit activity timeline.
15. Secure share links.
16. Email notifications.
17. Admin dashboard.
18. Security dashboard.
19. Global audit explorer.
20. Integrity verification tool.
21. File tagging.

Explicitly outside the mandatory MVP:

-   screenshot prevention,
-   remote deletion of downloaded files,
-   absolute DRM,
-   invisible adversarial watermarking,
-   automatic internet leak discovery,
-   blockchain,
-   AI leak detection,
-   device fingerprinting,
-   multi-format attribution.

------------------------------------------------------------------------

## 7. Primary Demo Flow

    Upload Real PDF
          ↓
    SHA-256 Integrity Hash Generated
          ↓
    Share with Three Registered Users
          ↓
    Set Expiry + One Download Limit
          ↓
    Login as Recipient
          ↓
    Download Attributed PDF
          ↓
    Show Recipient-Specific Watermark
          ↓
    Attempt Second Download
          ↓
    DOWNLOAD_LIMIT_REACHED
          ↓
    Rename Downloaded PDF
          ↓
    Upload to Leak Tracer
          ↓
    Fingerprint Extracted and Verified
          ↓
    Original Distribution Copy Identified
          ↓
    Open Lineage Graph
          ↓
    Show Recipient, Share, Copy and Trace History

The evaluator can provide an arbitrary valid PDF at demo time. VaultX
can upload, distribute, attribute, and trace the generated copy through
the same workflow.

------------------------------------------------------------------------

## 8. Known Limitations

1.  VaultX cannot guarantee that a downloaded PDF will never be copied,
    printed, screenshotted, or recreated.
2.  Deliberate metadata stripping can break the MVP's machine-readable
    tracing mechanism.
3.  Visible watermarks may be modified using PDF-editing tools.
4.  The MVP supports PDF attribution only.
5.  Local filesystem storage is suitable for the semester project but
    would require production-grade object storage and backup design at
    scale.
6.  The application audit log is not cryptographically tamper-proof.
7.  Leak Tracer analyses a recovered file supplied to VaultX; it does
    not automatically search the internet for leaked files.

------------------------------------------------------------------------

## 9. Suggested Report Framing

> **VaultX is a Java Spring Boot-based controlled digital asset
> distribution platform that preserves the identity and lineage of
> recipient-specific PDF copies using policy-driven access control,
> SHA-256 integrity verification, HMAC-signed fingerprints, dynamic
> watermarking, distribution tracking, and deterministic leak-source
> attribution.**

Short presentation version:

> **File-sharing platforms control the link. VaultX preserves the
> identity and lineage of the copy.**
