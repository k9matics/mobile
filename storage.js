"use strict";

/*
  HARNELYZER — Session Storage v0.1.0

  Kein localStorage:
  Die Anwendung läuft auch in sandboxed Umgebungen.
  Sessions bleiben für die aktuelle Browser-Sitzung erhalten.
*/

const Storage = (() => {
  const MAX_HARNESS_TESTS = 3;

  let study = createEmptyStudy();

  function createEmptyStudy() {
    return {
      id: createId("study"),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dog: {
        size: "medium",
        label: ""
      },
      sensorRoles: [
        {
          id: "back-main",
          name: "Rücken / Geschirr",
          required: true,
          status: "active"
        }
      ],
      reference: null,
      harnessTests: [],
      activeSession: null
    };
  }

  function createId(prefix) {
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now()}-${random}`;
  }

  function touch() {
    study.updatedAt = new Date().toISOString();
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeRole(role) {
    return {
      id: String(role?.id || "back-main"),
      name: String(role?.name || "Rücken / Geschirr"),
      required: Boolean(role?.required),
      status: String(role?.status || "planned")
    };
  }

  function setDogProfile(profile = {}) {
    study.dog = {
      ...study.dog,
      size: String(profile.size || study.dog.size || "medium"),
      label: String(profile.label || study.dog.label || "")
    };

    touch();
    return getStudy();
  }

  function setSensorRoles(roles) {
    if (!Array.isArray(roles) || roles.length === 0) {
      return getStudy();
    }

    const normalized = roles.map(normalizeRole);
    const hasMain = normalized.some(role => role.id === "back-main");

    if (!hasMain) {
      normalized.unshift({
        id: "back-main",
        name: "Rücken / Geschirr",
        required: true,
        status: "active"
      });
    }

    study.sensorRoles = normalized;
    touch();

    return getStudy();
  }

  function createSession({
    type,
    label,
    primaryRole = "back-main",
    sensorRoles = ["back-main"],
    dogSize = study.dog.size,
    harnessName = ""
  } = {}) {
    const isReference = type === "reference";

    return {
      id: createId(isReference ? "reference" : "harness"),
      type: isReference ? "reference" : "harness",
      label: String(
        label ||
          (isReference
            ? "REFERENZ OHNE GESCHIRR"
            : `GESCHIRR TEST ${getNextHarnessLetter()}`)
      ),
      harnessName: String(harnessName || ""),
      primaryRole: String(primaryRole || "back-main"),
      sensorRoles: Array.isArray(sensorRoles) && sensorRoles.length > 0
        ? [...new Set(sensorRoles.map(String))]
        : ["back-main"],
      dogSize: String(dogSize || "medium"),
      createdAt: new Date().toISOString(),
      startedAt: null,
      endedAt: null,
      samples: [],
      status: "ready",
      analysis: null
    };
  }

  function startSession(options = {}) {
    if (study.activeSession?.status === "recording") {
      throw new Error("EINE MESSUNG LÄUFT BEREITS");
    }

    const session = createSession(options);
    session.startedAt = new Date().toISOString();
    session.status = "recording";

    study.activeSession = session;
    touch();

    return getActiveSession();
  }

  function appendSample(packet) {
    if (!study.activeSession || study.activeSession.status !== "recording") {
      return false;
    }

    if (!packet || typeof packet !== "object") {
      return false;
    }

    study.activeSession.samples.push(clone(packet));

    if (study.activeSession.samples.length > 12000) {
      study.activeSession.samples.shift();
    }

    touch();
    return true;
  }

  function finishActiveSession(analysis = null) {
    if (!study.activeSession) {
      return null;
    }

    const session = clone(study.activeSession);
    session.endedAt = new Date().toISOString();
    session.status = "finished";
    session.analysis = analysis ? clone(analysis) : null;

    if (session.type === "reference") {
      study.reference = session;
    } else {
      const existingIndex = study.harnessTests.findIndex(
        item => item.id === session.id
      );

      if (existingIndex >= 0) {
        study.harnessTests[existingIndex] = session;
      } else {
        study.harnessTests.push(session);
      }

      study.harnessTests = study.harnessTests.slice(-MAX_HARNESS_TESTS);
    }

    study.activeSession = null;
    touch();

    return clone(session);
  }

  function cancelActiveSession() {
    if (!study.activeSession) return false;

    study.activeSession = null;
    touch();

    return true;
  }

  function getActiveSession() {
    return clone(study.activeSession);
  }

  function getReference() {
    return clone(study.reference);
  }

  function getHarnessTests() {
    return clone(study.harnessTests);
  }

  function getLatestHarnessTest() {
    if (study.harnessTests.length === 0) return null;
    return clone(study.harnessTests[study.harnessTests.length - 1]);
  }

  function getNextHarnessLetter() {
    const letters = ["A", "B", "C"];
    return letters[Math.min(study.harnessTests.length, letters.length - 1)];
  }

  function getStudy() {
    return clone(study);
  }

  function setReference(session) {
    study.reference = clone(session);
    touch();

    return getReference();
  }

  function addHarnessTest(session) {
    if (!session) return getHarnessTests();

    study.harnessTests.push(clone(session));
    study.harnessTests = study.harnessTests.slice(-MAX_HARNESS_TESTS);
    touch();

    return getHarnessTests();
  }

  function clearStudy() {
    study = createEmptyStudy();
    return getStudy();
  }

  /*
    Rückwärtskompatibilität für die bisherige App:
    getSamples/setSamples bleiben verfügbar, arbeiten aber
    auf der aktuell laufenden Session.
  */
  function setSamples(samples) {
    if (!study.activeSession) {
      study.activeSession = createSession({
        type: "harness",
        label: "TEMPORÄRE MESSUNG"
      });
      study.activeSession.status = "recording";
    }

    study.activeSession.samples = Array.isArray(samples)
      ? clone(samples)
      : [];

    touch();
  }

  function getSamples() {
    return clone(study.activeSession?.samples || []);
  }

  function clear() {
    clearStudy();
  }

  return {
    MAX_HARNESS_TESTS,
    createSession,
    setDogProfile,
    setSensorRoles,
    startSession,
    appendSample,
    finishActiveSession,
    cancelActiveSession,
    getActiveSession,
    getReference,
    getHarnessTests,
    getLatestHarnessTest,
    getNextHarnessLetter,
    getStudy,
    setReference,
    addHarnessTest,
    setSamples,
    getSamples,
    clear,
    clearStudy
  };
})();