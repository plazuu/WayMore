.PHONY: help install setup env server mobile ios android web dev typecheck test clean

help:
	@echo "Targets:"
	@echo "  make install    Install deps for mobile/, server/ and backend/"
	@echo "  make env        Create mobile/.env, server/.env and backend/.env from their .env.example (won't overwrite existing files)"
	@echo "  make setup      install + env, the one-shot 'get this running' target"
	@echo "  make server     Run server/ and backend/ together (server/ npm run dev:all)"
	@echo "  make mobile     Run the Expo dev server (pick a platform in the Expo CLI)"
	@echo "  make ios        Run the Expo dev server targeting iOS"
	@echo "  make android    Run the Expo dev server targeting Android"
	@echo "  make web        Run the Expo dev server targeting web"
	@echo "  make dev        Run server/, backend/ and mobile together in one terminal (Ctrl+C stops all)"
	@echo "  make typecheck  Typecheck mobile/, server/ and backend/"
	@echo "  make test       Run server/ and backend/ tests"
	@echo "  make clean      Remove node_modules in mobile/, server/ and backend/"

install:
	cd mobile && npm install
	cd server && npm install
	cd backend && npm install

env:
	@test -f mobile/.env || cp mobile/.env.example mobile/.env
	@test -f server/.env || cp server/.env.example server/.env
	@test -f backend/.env || cp backend/.env.example backend/.env
	@echo "mobile/.env, server/.env and backend/.env are ready — fill in API keys before running server-side features."

setup: install env

server:
	cd server && npm run dev:all

mobile:
	cd mobile && npm start

ios:
	cd mobile && npm run ios

android:
	cd mobile && npm run android

web:
	cd mobile && npm run web

dev:
	@trap 'kill 0' EXIT; \
	(cd server && npm run dev:all) & \
	(cd mobile && npm start) & \
	wait

typecheck:
	cd mobile && npx tsc --noEmit
	cd server && npm run typecheck
	cd backend && npm run typecheck

test:
	cd server && npm test
	cd backend && npm test

clean:
	rm -rf mobile/node_modules server/node_modules backend/node_modules
