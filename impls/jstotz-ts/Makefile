STEP_SOURCES := $(shell ls src/step*.ts)
ROOT_DIR = ../..

all: ts

node_modules:
	npm install

build/step%.js: node_modules src/*.ts
	./node_modules/.bin/tsc -p .

.PHONY: ts clean test lint

ts: $(foreach s,$(STEP_SOURCES),build/$(s:src/%.ts=%).js)

clean:
	rm -f build/*.js
	foo

test: ts
	$(MAKE) -C $(ROOT_DIR) REGRESS=1 test^jstotz-ts^stepA

lint:
	./node_modules/.bin/eslint --max-warnings=0 ./src

