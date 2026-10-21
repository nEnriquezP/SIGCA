# SIGCA — Contexto general del proyecto

## 1. Proyecto

**SIGCA — Sistema Integral de Gestión de Citas y Atención**

Proyecto universitario individual del curso de Desarrollo Web de
Ingeniería en Sistemas.

Desarrollador:

**Nelson Enríquez**

Este proyecto es individual. No existen otros integrantes.

---

## 2. Prioridad académica

La prioridad principal es cumplir exactamente con los requisitos
establecidos por el docente.

Por ahora NO implementar:

- SaaS
- multi-tenancy
- organizaciones
- `organizacionId`
- suscripciones
- planes comerciales
- pagos recurrentes de plataforma

Después de entregar la versión académica, SIGCA podrá evolucionar
hacia una plataforma SaaS para clínicas o sanatorios pequeños.

---

## 3. Arquitectura general

SIGCA utiliza un único repositorio tipo monorepo:

```text
SIGCA/
├── frontend/
├── backend/
├── docs/
├── postman/
├── README.md
├── AGENTS.md
└── .gitignore