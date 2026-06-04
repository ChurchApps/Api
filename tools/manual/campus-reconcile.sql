-- ============================================================================
-- campus-reconcile.sql  (HAND-RUN, ONE-TIME, per environment)
-- ============================================================================
-- Campuses are mastered in the MEMBERSHIP module. The ATTENDANCE module still
-- has its own (now frozen, read-only) `campuses` table that legacy readers use.
-- A per-module migration runs against a single module DB and cannot read across
-- databases, so the cross-database seed + backfill lives here.
--
-- Run this ONCE per environment, BEFORE deploying the frontend that reads
-- campuses from MembershipApi, using an account that can read both the
-- attendance and membership schemas.
--
-- Schema names: locally both DBs are `membership` and `attendance` on the same
-- MySQL server (see Api/.env.sample). If your environment uses different schema
-- names (e.g. an env suffix), adjust the qualified names below before running.
--
-- This script is idempotent — re-running it makes no further changes once the
-- membership copy is complete.
-- ============================================================================

-- 1) Seed membership.campuses from attendance.campuses, PRESERVING ids so that
--    attendance services.campusId continues to resolve against the membership
--    copy. Only copies attendance campuses that are not already present in
--    membership (by id). timezone/website are membership-only and left NULL.
INSERT INTO membership.campuses (id, churchId, name, address1, address2, city, state, zip, removed)
SELECT a.id, a.churchId, a.name, a.address1, a.address2, a.city, a.state, a.zip, 0
FROM attendance.campuses a
WHERE COALESCE(a.removed, 0) = 0
  AND NOT EXISTS (
    SELECT 1 FROM membership.campuses m WHERE m.id = a.id
  );

-- 2) Smart-hybrid backfill (single-database, within membership):
--    For each church that ends up with EXACTLY ONE non-removed campus, assign
--    that campus to every person/group that is currently unassigned. Churches
--    with multiple campuses are left unassigned (NULL) on purpose, so staff can
--    assign deliberately. Churches with no campus are left untouched.

-- People
UPDATE membership.people p
JOIN (
  SELECT churchId, MIN(id) AS campusId
  FROM membership.campuses
  WHERE COALESCE(removed, 0) = 0
  GROUP BY churchId
  HAVING COUNT(*) = 1
) single ON single.churchId = p.churchId
SET p.campusId = single.campusId
WHERE p.campusId IS NULL
  AND COALESCE(p.removed, 0) = 0;

-- Groups
UPDATE membership.`groups` g
JOIN (
  SELECT churchId, MIN(id) AS campusId
  FROM membership.campuses
  WHERE COALESCE(removed, 0) = 0
  GROUP BY churchId
  HAVING COUNT(*) = 1
) single ON single.churchId = g.churchId
SET g.campusId = single.campusId
WHERE g.campusId IS NULL
  AND COALESCE(g.removed, 0) = 0;

-- NOTE: doing.plans also has a campusId column but lives in a separate (doing)
-- database. If you want to backfill plans for single-campus churches, run an
-- equivalent UPDATE against doing.plans joined to membership.campuses once the
-- doing DB is reachable in the same session.
