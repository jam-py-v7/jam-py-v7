#!/usr/bin/env python3

import os
import subprocess
from jsmin import jsmin


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


def git_timestamp(filename):
    try:
        result = subprocess.check_output(
            ['git', 'log', '-1', '--format=%ct', '--', filename],
            cwd=ROOT,
            text=True
        ).strip()

        return int(result) if result else 0

    except subprocess.CalledProcessError:
        return 0


def get_min_name(filename):
    base, ext = os.path.splitext(filename)
    return base + '.min' + ext


#def needs_update(source, min_file):
#    if not os.path.exists(min_file):
#        return True
#
#    return git_timestamp(source) > git_timestamp(min_file)
def needs_update(source, min_file):
    if not os.path.exists(min_file):
        return True

    return os.path.getmtime(source) > os.path.getmtime(min_file)

def minify_js(filename):
    output = get_min_name(filename)

    with open(filename, encoding='utf-8') as f:
        data = f.read()

    with open(output, 'w', encoding='utf-8') as f:
        f.write(jsmin(data))

    print(f'UPDATED: {output}')


def minify_css(filename):
    output = get_min_name(filename)

    with open(filename, encoding='utf-8') as f:
        data = f.read()

    data = data.replace('\n', '').replace('\r', '').replace('\t', '')

    with open(output, 'w', encoding='utf-8') as f:
        f.write(data)

    print(f'UPDATED: {output}')


def check_file(filename):

    min_file = get_min_name(filename)

    if needs_update(filename, min_file):
        if filename.endswith('.js'):
            minify_js(filename)
        elif filename.endswith('.css'):
            minify_css(filename)
    else:
        print(f'OK:      {filename}')


def main():

    files = []

    # JS files directly in jam/js
    js_folder = os.path.join(ROOT, 'jam', 'js')

    for name in os.listdir(js_folder):
        if name.endswith('.js') and not name.endswith('.min.js'):
            files.append(os.path.join(js_folder, name))


    # JS files directly in jam/js/modules
    modules_folder = os.path.join(ROOT, 'jam', 'js', 'modules')

    for name in os.listdir(modules_folder):
        if name.endswith('.js') and not name.endswith('.min.js'):
            files.append(os.path.join(modules_folder, name))

    # Core CSS
    files += [
        os.path.join(ROOT, 'jam', 'css', 'jam.css'),
        os.path.join(ROOT, 'jam', 'css', 'jam12.css'),
        os.path.join(ROOT, 'jam', 'css', 'admin.css'),
    ]

    for f in files:
        check_file(f)


if __name__ == '__main__':
    main()
