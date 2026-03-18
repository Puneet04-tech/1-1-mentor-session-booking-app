#!/usr/bin/env python3
"""
Code Execution Service
Safely execute code snippets using Piston API
"""

import requests
import json
from typing import Dict, Any

PISTON_API = "https://emkc.org/api/v2"

def execute_code(code: str, language: str, input_data: str = "") -> Dict[str, Any]:
    """
    Execute code using Piston API
    
    Args:
        code: Source code to execute
        language: Programming language (javascript, python, java, cpp, etc.)
        input_data: Input for the program
    
    Returns:
        Execution result with output/error
    """
    
    # Language to Piston language mapping
    language_map = {
        'javascript': 'javascript',
        'js': 'javascript',
        'python': 'python',
        'py': 'python',
        'java': 'java',
        'typescript': 'typescript',
        'ts': 'typescript',
        'cpp': 'cpp',
        'c++': 'cpp',
        'csharp': 'csharp',
        'c#': 'csharp',
        'ruby': 'ruby',
        'go': 'go',
        'rust': 'rust',
        'php': 'php',
    }
    
    piston_lang = language_map.get(language.lower(), language)
    
    try:
        response = requests.post(
            f"{PISTON_API}/execute",
            json={
                "language": piston_lang,
                "version": "*",
                "files": [
                    {
                        "name": "main",
                        "content": code
                    }
                ],
                "stdin": input_data
            },
            timeout=10
        )
        
        result = response.json()
        
        if response.status_code == 200:
            run_result = result.get("run", {})
            return {
                "success": True,
                "output": run_result.get("stdout", ""),
                "error": run_result.get("stderr", ""),
                "exitCode": run_result.get("code", 0)
            }
        else:
            return {
                "success": False,
                "error": f"API Error: {result.get('message', 'Unknown error')}",
                "output": ""
            }
            
    except requests.exceptions.Timeout:
        return {
            "success": False,
            "error": "Code execution timed out",
            "output": ""
        }
    except requests.exceptions.RequestException as e:
        return {
            "success": False,
            "error": f"Request failed: {str(e)}",
            "output": ""
        }
    except json.JSONDecodeError:
        return {
            "success": False,
            "error": "Invalid response from execution service",
            "output": ""
        }


if __name__ == "__main__":
    # Test example
    test_code = """
console.log("Hello, Mentor Sessions!");
console.log("2 + 2 =", 2 + 2);
"""
    
    result = execute_code(test_code, "javascript")
    print(json.dumps(result, indent=2))
