.PHONY: help install server mobile ios android web dev typecheck test clean

help:
	@echo "Targets:"
	@echo "  make install    Install deps for mobile/ and server/"
	@echo "  make server     Run the Express API (server/ npm run dev)"
	@echo "  make mobile     Run the Expo dev server (pick a platform in the Expo CLI)"
	@echo "  make ios        Run the Expo dev server targeting iOS"
	@echo "  make android    Run the Expo dev server targeting Android"
	@echo "  make web        Run the Expo dev server targeting web"
	@echo "  make dev        Run server/ and mobile/ together (Ctrl+C stops both)"
	@echo "  make typecheck  Typecheck mobile/ and server/"
	@echo "  make test       Run server/ tests"
	@echo "  make clean      Remove node_modules in mobile/ and server/"
	@echo ""
	@echo "Before running the server, create server/.env with GOOGLE_MAPS_API_KEY."

install:
	cd mobile && npm install
	cd server && npm install

server:
	cd server && npm run dev

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
	(cd server && npm run dev) & \
	(cd mobile && npm start) & \
	wait

typecheck:
	cd mobile && npx tsc --noEmit
	cd server && npm run typecheck

test:
	cd server && npm test

clean:
	rm -rf mobile/node_modules server/node_modules
