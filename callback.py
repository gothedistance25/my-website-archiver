def callback(commit):
    if commit.author_email == b"21273266+notwopr@users.noreply.github.com":
        commit.author_name = b"Hercules"
        commit.author_email = b"herc@gothedistance.dev"
    if commit.committer_email == b"21273266+notwopr@users.noreply.github.com":
        commit.committer_name = b"Hercules"
        commit.committer_email = b"herc@gothedistance.dev"
