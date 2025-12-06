with open('bot-description-400.txt', 'r', encoding='utf-8') as f:
    content = f.read().strip()
    length = len(content)
    print(f"Current length: {length} characters")
    print(f"Need to {'add' if length < 400 else 'remove'} {abs(400 - length)} characters")
    print("\nContent:")
    print(content)

