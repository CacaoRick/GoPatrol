#!/bin/sh
here="`dirname \"$0\"`"
echo "cd to $here"
cd "$here"
echo "node version:"
./node -v
./node index.js