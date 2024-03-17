#!/bin/bash
# Navigate to the Lua source directory
cd /lua-${LUA_VERSION}/src

# Clean up any previous build artifacts
make clean

# Compile each Lua source file to an object file using emcc
for file in *.c; do
    emcc -s WASM=1 -s SIDE_MODULE=1 -U LUA_32BITS -O2 -Wall -Wextra -DLUA_COMPAT_5_2 -I. -c $file -o ${file%.c}.o
done

# Now compile sqlite3.c to an object file
emcc -s WASM=1 -s SIDE_MODULE=1 -U LUA_32BITS -O2 -I. -c /lua-${LUA_VERSION}/src/sqlite3.c -o /lua-${LUA_VERSION}/src/sqlite3.o
mkdir -p /output

# Collect all object files except lua.o and luac.o
objects=$(find /lua-5.3.4/src -name "*.o" ! -name "lua.o" ! -name "luac.o")

# Link the object files, excluding lua.o and luac.o
emcc -s WASM=1 -s SIDE_MODULE=1 $objects -o /output/lua_sqlite.wasm --no-entry

